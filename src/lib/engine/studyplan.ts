// Automatic study planning.
//
// For an exam, decides HOW MUCH total preparation is warranted (grade weight,
// exam kind, course difficulty, topic count, weak topics) and WHAT to study in
// each session (topics split across early sessions, practice + weak concepts
// in the middle, full review near the end, short recall on exam day). Every
// plan carries a rationale explaining WHY that amount was recommended.

import { addDays, startOfDay } from "date-fns";
import { daysUntil, fmtMinutes } from "@/lib/dates";
import type { ExamKind, StudyPlan, StudySessionPlan } from "@/lib/types";

export interface StudyPlanInput {
  examId: string;
  examTitle: string;
  courseCode: string;
  kind: ExamKind;
  startAt: Date;
  weight?: number | null; // percent of final grade
  courseDifficulty?: number; // 1..5
  topics: string[]; // in-scope topics/lectures/chapters
  weakTopics?: string[]; // mastery NEEDS_REVIEW
  now?: Date;
  /** Max minutes the planner may put in a single day (default 150). */
  maxSessionMinutes?: number;
}

const BASE_BY_KIND: Record<ExamKind, number> = {
  QUIZ: 90,
  TEST: 180,
  MIDTERM: 360,
  FINAL: 600,
};

function roundTo15(n: number): number {
  return Math.max(15, Math.round(n / 15) * 15);
}

/** Total recommended prep minutes + the explanation for that number. */
export function recommendedPrepMinutes(input: StudyPlanInput): {
  minutes: number;
  rationale: string;
} {
  const base = BASE_BY_KIND[input.kind] ?? 180;
  const difficulty = input.courseDifficulty ?? 3;
  const diffMult = 1 + (difficulty - 3) * 0.2;
  const weight = input.weight ?? 0;
  const weightMult = weight >= 30 ? 1.25 : weight >= 20 ? 1.1 : 1;
  const weakBonus = (input.weakTopics?.length ?? 0) * 25;
  const topicBonus = Math.max(0, input.topics.length - 4) * 10;

  const minutes = roundTo15(base * diffMult * weightMult + weakBonus + topicBonus);

  const parts: string[] = [];
  parts.push(
    `${input.kind === "FINAL" ? "Finals" : input.kind === "QUIZ" ? "Quizzes" : "Exams"} of this type warrant a ~${fmtMinutes(base)} baseline`,
  );
  if (weight >= 20)
    parts.push(`it's worth ${weight}% of your grade (+${Math.round((weightMult - 1) * 100)}%)`);
  if (difficulty >= 4) parts.push(`the course is difficulty ${difficulty}/5`);
  if (difficulty <= 2) parts.push(`the course is lighter (difficulty ${difficulty}/5)`);
  if (input.weakTopics?.length)
    parts.push(
      `${input.weakTopics.length} topic${input.weakTopics.length > 1 ? "s" : ""} flagged "needs review" (+${weakBonus} min)`,
    );
  if (input.topics.length > 4) parts.push(`${input.topics.length} topics in scope`);

  return {
    minutes,
    rationale: `${fmtMinutes(minutes)} total recommended: ${parts.join("; ")}.`,
  };
}

/**
 * Build the day-by-day plan. Sessions ramp UP toward the exam (spaced early
 * coverage, concentrated review late), capped per day, with a short recall
 * session on exam day itself.
 */
export function buildStudyPlan(input: StudyPlanInput): StudyPlan {
  const now = input.now ?? new Date();
  const maxSession = input.maxSessionMinutes ?? 150;
  const { minutes: totalTarget, rationale } = recommendedPrepMinutes(input);

  const daysLeft = daysUntil(input.startAt, now);
  const sessions: StudySessionPlan[] = [];

  if (daysLeft < 0) {
    return { examId: input.examId, totalMinutes: 0, rationale: "Exam has passed.", sessions: [] };
  }

  // Exam-day recall session (kept short, always ≤ 30 min).
  const recallMinutes = daysLeft >= 1 ? 30 : Math.min(45, totalTarget);
  const examDay = startOfDay(input.startAt);
  const recall: StudySessionPlan = {
    daysBeforeExam: 0,
    date: examDay,
    minutes: recallMinutes,
    focus: "Final recall review — skim summaries, formulas, and flagged weak spots",
    rationale: "Short same-day recall beats last-minute cramming.",
  };

  if (daysLeft === 0) {
    return {
      examId: input.examId,
      totalMinutes: recall.minutes,
      rationale: `Exam is today — only a recall pass is realistic. (${rationale})`,
      sessions: [recall],
    };
  }

  // Days available for real studying (up to 10 days out; earlier adds little).
  const studyDays = Math.min(daysLeft, 10);
  let remaining = totalTarget - recallMinutes;

  // Ascending intensity weights: earliest day lightest.
  const weights = Array.from({ length: studyDays }, (_, i) => 1 + i * 0.45);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const rawAlloc = weights.map((w) => (remaining * w) / weightSum);

  // Cap per-day; redistribute overflow into earlier days if possible.
  const alloc = rawAlloc.map((m) => Math.min(maxSession, roundTo15(m)));
  let overflow = remaining - alloc.reduce((a, b) => a + b, 0);
  for (let i = alloc.length - 1; i >= 0 && overflow >= 15; i--) {
    const room = maxSession - alloc[i];
    const add = Math.min(room, roundTo15(overflow));
    alloc[i] += add;
    overflow -= add;
  }

  // Topic assignment: split topic list over the first ~60% of sessions,
  // practice + weak concepts in the middle, full review last.
  const topics = input.topics.length ? input.topics : ["all course material so far"];
  const weak = input.weakTopics ?? [];
  const coverageSessions = Math.max(1, Math.ceil(studyDays * 0.6));
  const perSession = Math.ceil(topics.length / coverageSessions);

  for (let i = 0; i < studyDays; i++) {
    const daysBefore = studyDays - i; // studyDays..1
    const date = startOfDay(addDays(input.startAt, -daysBefore));
    if (alloc[i] < 15) continue;

    let focus: string;
    let why: string;
    if (i < coverageSessions) {
      const chunk = topics.slice(i * perSession, (i + 1) * perSession);
      focus = chunk.length
        ? `Review: ${chunk.join(", ")}`
        : "Review remaining material";
      why = "Early spaced coverage of the material.";
    } else if (i === studyDays - 1) {
      focus = "Full review + timed practice test";
      why = "Consolidation the day before locks in retrieval.";
    } else {
      focus = weak.length
        ? `Practice problems + weak concepts (${weak.join(", ")})`
        : "Practice problems + self-quiz on shaky areas";
      why = "Active practice exposes gaps while there's time to fix them.";
    }

    sessions.push({
      daysBeforeExam: daysBefore,
      date,
      minutes: alloc[i],
      focus,
      rationale: why,
    });
  }

  sessions.push(recall);
  const totalMinutes = sessions.reduce((s, x) => s + x.minutes, 0);
  return { examId: input.examId, totalMinutes, rationale, sessions };
}
