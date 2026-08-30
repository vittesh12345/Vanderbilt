// Claude integration layer.
//
// Every feature in College OS works without an API key via the heuristic
// engines; when ANTHROPIC_API_KEY is set this module upgrades three surfaces:
//   1. Syllabus extraction — Claude reads the raw syllabus and returns a
//      refined SyllabusExtraction (merged with, never replacing, heuristics).
//   2. The chat interface — answers questions strictly from the user's actual
//      data (a compact JSON context pack), not from general knowledge.
//   3. Study-plan narratives — richer WHY explanations.
//
// Server-side only. Never import from client components.

import Anthropic from "@anthropic-ai/sdk";
import type { SyllabusExtraction } from "@/lib/types";

const MODEL = "claude-opus-5";

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

function firstText(response: Anthropic.Message): string {
  for (const block of response.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

/** Pull the first JSON object out of a model response, tolerating fences. */
function extractJson<T>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

const SYLLABUS_SYSTEM = `You extract structured data from university course syllabi. Respond with ONLY a JSON object (no prose, no markdown fences) with this exact shape:

{
  "courseInfo": {"code"?: string, "title"?: string, "professor"?: string, "professorEmail"?: string, "location"?: string, "credits"?: number, "meetingTimes"?: string},
  "gradeWeights": [{"category": string, "weight": number, "confidence": "HIGH"|"MEDIUM"|"LOW"}],
  "dates": [{"title": string, "kind": "ASSIGNMENT"|"EXAM"|"QUIZ"|"READING"|"PROJECT_MILESTONE"|"OTHER", "date": "YYYY-MM-DD", "time"?: "HH:MM", "details"?: string, "confidence": "HIGH"|"MEDIUM"|"LOW", "sourceLine"?: string}],
  "officeHours": [{"day": string, "start": string, "end": string, "location"?: string, "confidence": "HIGH"|"MEDIUM"|"LOW"}],
  "materials": [{"title": string, "author"?: string, "required": boolean, "confidence": "HIGH"|"MEDIUM"|"LOW"}],
  "policies": [{"topic": string, "summary": string}],
  "objectives": [string],
  "warnings": [string]
}

Rules:
- Extract EVERY dated item: assignments, exams, quizzes, readings, project milestones.
- weight is a percent (0-100). date must be ISO YYYY-MM-DD; infer the year from the semester context in the syllabus, and add a warning if you had to guess.
- confidence reflects how explicit the syllabus is; use LOW for anything inferred.
- sourceLine quotes the syllabus line the item came from (<=160 chars).
- If two parts of the syllabus contradict each other, extract both items and add a warning describing the contradiction. Never silently pick one.`;

export async function refineSyllabusWithAI(
  rawText: string,
  heuristic: SyllabusExtraction,
): Promise<SyllabusExtraction> {
  if (!aiAvailable()) return heuristic;
  try {
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYLLABUS_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Extract the structured data from this syllabus:\n\n${rawText.slice(0, 100_000)}`,
        },
      ],
    });
    const parsed = extractJson<Partial<SyllabusExtraction>>(firstText(response));
    if (!parsed) return heuristic;

    // Merge: AI result is primary for what it found; heuristic items the AI
    // missed are kept (matched by title+date) so nothing silently disappears.
    const merged: SyllabusExtraction = {
      courseInfo: { ...heuristic.courseInfo, ...(parsed.courseInfo ?? {}) },
      gradeWeights: parsed.gradeWeights?.length
        ? parsed.gradeWeights
        : heuristic.gradeWeights,
      dates: parsed.dates ?? [],
      officeHours: parsed.officeHours?.length
        ? parsed.officeHours
        : heuristic.officeHours,
      materials: parsed.materials?.length ? parsed.materials : heuristic.materials,
      policies: parsed.policies?.length ? parsed.policies : heuristic.policies,
      objectives: parsed.objectives?.length ? parsed.objectives : heuristic.objectives,
      warnings: [...(parsed.warnings ?? []), ...heuristic.warnings],
      aiUsed: true,
    };
    const have = new Set(
      merged.dates.map((d) => `${d.title.toLowerCase()}|${d.date}`),
    );
    for (const d of heuristic.dates) {
      const k = `${d.title.toLowerCase()}|${d.date}`;
      if (!have.has(k)) {
        merged.dates.push({ ...d, confidence: "LOW" });
        have.add(k);
      }
    }
    return merged;
  } catch (error) {
    // AI refinement is best-effort; the heuristic extraction stands on its own.
    const note =
      error instanceof Anthropic.APIError
        ? `AI refinement unavailable (API error ${error.status}); showing heuristic extraction.`
        : "AI refinement unavailable; showing heuristic extraction.";
    return { ...heuristic, warnings: [...heuristic.warnings, note] };
  }
}

const CHAT_SYSTEM = `You are the AI chief of staff inside "College OS", a Vanderbilt student's personal academic command center. You are given a JSON snapshot of the student's REAL data: courses, assignments, exams, study plans, workload forecast, calendar events, goals, and alerts.

Rules:
- Answer ONLY from the provided data. If the data doesn't contain the answer, say so plainly and suggest where in the app to add it.
- Be specific: name the course, the assignment, the date, the estimated minutes. Never invent deadlines, courses, clubs, or facts.
- When asked "what should I do", use the provided priority ranking; explain the reasoning briefly.
- When asked about studying, reference the actual study plan sessions and topics.
- Times matter: "tonight" and "today" refer to the currentTime field.
- Keep answers tight and actionable — a busy student reads these between classes. Use short paragraphs or compact lists, not headers.`;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function answerWithAI(
  question: string,
  contextPack: unknown,
  history: ChatTurn[] = [],
): Promise<string> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [
      { type: "text", text: CHAT_SYSTEM },
      {
        type: "text",
        text: `Student data snapshot:\n${JSON.stringify(contextPack)}`,
      },
    ],
    messages: [
      ...history.slice(-10).map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content: question },
    ],
  });
  return firstText(response) || "I couldn't produce an answer — try rephrasing.";
}
