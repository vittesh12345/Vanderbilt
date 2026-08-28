// Heuristic syllabus extraction.
//
// Works entirely offline: regex/section heuristics pull dates, grade weights,
// office hours, materials, policies, and course info out of pasted syllabus
// text, each tagged with a confidence and the source line so the review UI
// can show exactly where a claim came from. When ANTHROPIC_API_KEY is set,
// src/lib/ai/claude.ts refines this extraction; the heuristic result is the
// floor, not a fallback that silently disappears.

import type {
  Confidence,
  ExtractedDate,
  SyllabusExtraction,
} from "@/lib/types";

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const MONTH_DATE_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/gi;
const NUMERIC_DATE_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const COURSE_CODE_RE = /\b([A-Z]{2,4})\s?-?\s?(\d{3,4}[A-Za-z]?)\b/;
const PERCENT_AFTER_RE = /([A-Za-z][A-Za-z /&()'-]{2,40}?)\s*[:–—-]\s*(\d{1,3})\s*%/g;
const PERCENT_BEFORE_RE = /(\d{1,3})\s*%\s*[:–—-]?\s*([A-Za-z][A-Za-z /&()'-]{2,40})/g;
const OFFICE_DAYTIME_RE =
  /\b(Mon(?:day)?s?|Tue(?:s(?:day)?)?s?|Wed(?:nesday)?s?|Thu(?:rs(?:day)?)?s?|Fri(?:day)?s?|MWF|MW|TR|TTh|T\/Th)\b[^.\n]{0,40}?(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*[–—-]\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))/i;

export interface ParseOptions {
  /** Year to assume for dates with no explicit year (default: current year). */
  defaultYear?: number;
  now?: Date;
}

interface FoundDate {
  month: number;
  day: number;
  year: number | null;
  index: number;
}

function findDates(line: string): FoundDate[] {
  const out: FoundDate[] = [];
  for (const m of line.matchAll(MONTH_DATE_RE)) {
    const key = m[1].slice(0, 3).toLowerCase();
    const month = MONTHS[key];
    const day = Number(m[2]);
    if (month === undefined || day < 1 || day > 31) continue;
    out.push({ month, day, year: m[3] ? Number(m[3]) : null, index: m.index ?? 0 });
  }
  for (const m of line.matchAll(NUMERIC_DATE_RE)) {
    const month = Number(m[1]) - 1;
    const day = Number(m[2]);
    if (month < 0 || month > 11 || day < 1 || day > 31) continue;
    let year: number | null = null;
    if (m[3]) {
      year = Number(m[3]);
      if (year < 100) year += 2000;
    }
    out.push({ month, day, year, index: m.index ?? 0 });
  }
  return out;
}

function classifyLine(line: string): {
  kind: ExtractedDate["kind"];
  confidence: Confidence;
  strong: boolean;
} | null {
  const l = line.toLowerCase();
  const hasDue = /\b(due|submit|turn(?:ed)?\s+in|deadline)\b/.test(l);

  if (/\bfinal\s+exam\b|\bfinal\b(?=.*\bexam)/.test(l) || /\bfinal exam\b/.test(l))
    return { kind: "EXAM", confidence: "HIGH", strong: true };
  if (/\b(midterm|exam|test)\b/.test(l))
    return { kind: "EXAM", confidence: hasDue ? "HIGH" : "HIGH", strong: true };
  if (/\bquiz(?:zes)?\b/.test(l))
    return { kind: "QUIZ", confidence: "HIGH", strong: true };
  if (/\b(milestone|proposal|draft|presentation|demo)\b/.test(l))
    return { kind: "PROJECT_MILESTONE", confidence: hasDue ? "HIGH" : "MEDIUM", strong: hasDue };
  if (/\b(problem\s*set|p-?set|homework|hw\s*\d|assignment|essay|paper|project|lab\s*\d?|worksheet|discussion\s+post)\b/.test(l))
    return { kind: "ASSIGNMENT", confidence: hasDue ? "HIGH" : "MEDIUM", strong: hasDue };
  if (/\b(read(?:ing)?|chapter|ch\.|pages|pp\.)\b/.test(l))
    return { kind: "READING", confidence: hasDue ? "HIGH" : "MEDIUM", strong: false };
  if (hasDue) return { kind: "ASSIGNMENT", confidence: "MEDIUM", strong: true };
  return null;
}

function titleFromLine(line: string): string {
  // Strip leading list markers, dates, and trailing separators to get a title.
  let t = line
    .replace(MONTH_DATE_RE, "")
    .replace(NUMERIC_DATE_RE, "")
    .replace(/\b(due|deadline)\b:?/gi, "")
    .replace(/^[\s\d.)\-–—•*|]+/, "")
    .replace(/[\s:\-–—•|]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (t.length > 80) t = t.slice(0, 77) + "…";
  return t || "Untitled item";
}

type Section =
  | "GRADING"
  | "SCHEDULE"
  | "OFFICE_HOURS"
  | "MATERIALS"
  | "POLICIES"
  | "OBJECTIVES"
  | "OTHER";

function sectionFor(line: string): Section | null {
  const l = line.toLowerCase().trim();
  if (l.length > 60) return null; // headers are short
  if (/^(grading|grade breakdown|grade distribution|evaluation|assessment|course grade)/.test(l))
    return "GRADING";
  if (/^(course\s+)?(schedule|calendar|timeline|weekly plan|important dates|key dates)/.test(l))
    return "SCHEDULE";
  if (/office hours/.test(l)) return "OFFICE_HOURS";
  if (/^(required\s+)?(text(?:book)?s?|materials|readings|books)/.test(l)) return "MATERIALS";
  if (/^(course\s+)?(polic|late work|attendance|academic integrity|honor code)/.test(l))
    return "POLICIES";
  if (/^(course\s+)?(objectives|learning (?:goals|outcomes))/.test(l)) return "OBJECTIVES";
  return null;
}

export function parseSyllabus(
  rawText: string,
  opts: ParseOptions = {},
): SyllabusExtraction {
  const now = opts.now ?? new Date();
  const defaultYear = opts.defaultYear ?? now.getFullYear();
  const lines = rawText.split(/\r?\n/);
  const warnings: string[] = [];

  const extraction: SyllabusExtraction = {
    courseInfo: {},
    gradeWeights: [],
    dates: [],
    officeHours: [],
    materials: [],
    policies: [],
    objectives: [],
    warnings,
    aiUsed: false,
  };

  // ---- Course info from the head of the document -------------------------
  const head = lines.slice(0, 20);
  for (const line of head) {
    if (!extraction.courseInfo.code) {
      const m = COURSE_CODE_RE.exec(line);
      if (m) {
        extraction.courseInfo.code = `${m[1]} ${m[2]}`;
        const after = line.slice((m.index ?? 0) + m[0].length).replace(/^[\s:–—-]+/, "").trim();
        if (after.length > 3 && !extraction.courseInfo.title)
          extraction.courseInfo.title = after;
      }
    }
    const prof = /\b(?:professor|instructor|dr\.?|prof\.?)\s*[:\s]\s*([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){0,3})/i.exec(line);
    if (prof && !extraction.courseInfo.professor)
      extraction.courseInfo.professor = prof[1].trim();
    const email = EMAIL_RE.exec(line);
    if (email && !extraction.courseInfo.professorEmail)
      extraction.courseInfo.professorEmail = email[0];
    const credits = /(\d(?:\.\d)?)\s*credit/i.exec(line);
    if (credits && !extraction.courseInfo.credits)
      extraction.courseInfo.credits = Number(credits[1]);
    const meet = /\b(MWF|MW|TR|TTh|T\/Th|MTWRF)\b[^\n]{0,30}\d{1,2}[:.]?\d{0,2}/.exec(line);
    if (meet && !extraction.courseInfo.meetingTimes)
      extraction.courseInfo.meetingTimes = line.trim();
  }

  // ---- Walk the document with section tracking ---------------------------
  let section: Section = "OTHER";
  let materialsBudget = 0;
  let objectivesBudget = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const newSection = sectionFor(trimmed);
    if (newSection) {
      section = newSection;
      if (section === "MATERIALS") materialsBudget = 8;
      if (section === "OBJECTIVES") objectivesBudget = 10;
      // A header line like "Office Hours: MW 2-3pm" can also carry content.
      if (section !== "OFFICE_HOURS") continue;
    }

    // Grade weights (searched everywhere, but grading section boosts confidence)
    for (const m of trimmed.matchAll(PERCENT_AFTER_RE)) {
      const weight = Number(m[2]);
      if (weight <= 0 || weight > 100) continue;
      extraction.gradeWeights.push({
        category: m[1].trim(),
        weight,
        confidence: section === "GRADING" ? "HIGH" : "MEDIUM",
      });
    }
    if (section === "GRADING") {
      for (const m of trimmed.matchAll(PERCENT_BEFORE_RE)) {
        const weight = Number(m[1]);
        if (weight <= 0 || weight > 100) continue;
        const cat = m[2].trim();
        if (extraction.gradeWeights.some((g) => g.category.toLowerCase() === cat.toLowerCase()))
          continue;
        extraction.gradeWeights.push({ category: cat, weight, confidence: "HIGH" });
      }
    }

    // Office hours
    if (section === "OFFICE_HOURS" || /office hours/i.test(trimmed)) {
      const m = OFFICE_DAYTIME_RE.exec(trimmed);
      if (m) {
        extraction.officeHours.push({
          day: m[1],
          start: m[2].trim(),
          end: m[3].trim(),
          confidence: "MEDIUM",
        });
      }
    }

    // Materials
    if (section === "MATERIALS" && materialsBudget > 0 && !newSection) {
      materialsBudget--;
      if (trimmed.length > 8 && !/^\d+%/.test(trimmed)) {
        extraction.materials.push({
          title: trimmed.replace(/^[-•*]\s*/, "").slice(0, 120),
          required: !/optional|recommended/i.test(trimmed),
          confidence: "MEDIUM",
        });
      }
    }

    // Objectives
    if (section === "OBJECTIVES" && objectivesBudget > 0 && !newSection) {
      objectivesBudget--;
      if (trimmed.length > 10)
        extraction.objectives.push(trimmed.replace(/^[-•*\d.)\s]+/, ""));
    }

    // Policies
    if (
      /\b(late (?:work|polic|submissions?)|penalt|attendance|participation.{0,20}requir|regrade|academic integrity|honor code|laptops?|no make-?up)\b/i.test(
        trimmed,
      ) && trimmed.length > 20
    ) {
      const topic = /late/i.test(trimmed)
        ? "Late policy"
        : /attendance|participation/i.test(trimmed)
          ? "Attendance/participation"
          : /integrity|honor/i.test(trimmed)
            ? "Academic integrity"
            : "Policy";
      if (!extraction.policies.some((p) => p.summary === trimmed.slice(0, 200)))
        extraction.policies.push({ topic, summary: trimmed.slice(0, 200) });
    }

    // Dated items
    const dates = findDates(trimmed);
    if (dates.length) {
      const cls = classifyLine(trimmed);
      if (cls) {
        const d = dates[0];
        const year = d.year ?? defaultYear;
        if (!d.year && (section !== "SCHEDULE" || d.month < now.getMonth() - 6)) {
          // ambiguous year — keep default but flag once
          if (!warnings.includes("Some dates had no explicit year; assumed " + year + "."))
            warnings.push("Some dates had no explicit year; assumed " + year + ".");
        }
        const iso = `${year}-${String(d.month + 1).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
        const time = TIME_RE.exec(trimmed);
        let hm: string | undefined;
        if (time) {
          let h = Number(time[1]) % 12;
          if (/p/i.test(time[3])) h += 12;
          hm = `${String(h).padStart(2, "0")}:${time[2] ?? "00"}`;
        }
        extraction.dates.push({
          title: titleFromLine(trimmed),
          kind: cls.kind,
          date: iso,
          time: hm,
          confidence:
            cls.strong || section === "SCHEDULE" ? cls.confidence : "MEDIUM",
          sourceLine: trimmed.slice(0, 160),
        });
      }
    }
  }

  // ---- Sanity checks ------------------------------------------------------
  // Dedupe grade weights by category (keep highest confidence).
  const seen = new Map<string, (typeof extraction.gradeWeights)[number]>();
  for (const g of extraction.gradeWeights) {
    const k = g.category.toLowerCase();
    if (!seen.has(k)) seen.set(k, g);
  }
  extraction.gradeWeights = [...seen.values()];

  const weightSum = extraction.gradeWeights.reduce((s, g) => s + g.weight, 0);
  if (extraction.gradeWeights.length && Math.abs(weightSum - 100) > 3) {
    warnings.push(
      `Grade weights sum to ${weightSum}%, not 100% — some categories may be missing or misparsed.`,
    );
  }
  if (!extraction.dates.length) {
    warnings.push("No dated items found — the schedule may be in a table or separate document.");
  }

  // Dedupe dates (same title+date).
  const dateSeen = new Set<string>();
  extraction.dates = extraction.dates.filter((d) => {
    const k = `${d.title.toLowerCase()}|${d.date}`;
    if (dateSeen.has(k)) return false;
    dateSeen.add(k);
    return true;
  });

  return extraction;
}
