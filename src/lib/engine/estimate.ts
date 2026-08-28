// Time estimation with calibration from recorded actuals.
//
// Estimates are heuristic (kind × difficulty) until the user has history;
// then a per-course (falling back to global) actual/estimated ratio corrects
// future estimates — "your problem sets run 1.3× the estimate".

import type { AssignmentKind } from "@/lib/types";

const BASE_MINUTES: Record<AssignmentKind, number> = {
  HOMEWORK: 90,
  PROBLEM_SET: 135,
  ESSAY: 180,
  PROJECT: 300,
  READING: 60,
  LAB: 120,
  DISCUSSION: 30,
  PRESENTATION: 150,
  OTHER: 60,
};

export interface EstimateInput {
  kind: AssignmentKind;
  difficulty: number; // 1..5
}

export interface EstimateRecord {
  courseId?: string | null;
  estimated: number;
  actual: number;
}

export interface Estimate {
  minutes: number; // midpoint
  minutesMax: number; // upper bound → "60–90 min"
  confidence: "HIGH" | "MEDIUM" | "LOW";
  calibration: number; // multiplier that was applied (1.0 = none)
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Calibration factor for a course from estimate-vs-actual history.
 * Uses the median ratio (robust to one blown deadline), clamped to [0.5, 2].
 * Falls back to all-course history, then 1.0.
 */
export function calibrationFactor(
  records: EstimateRecord[],
  courseId?: string | null,
): number {
  const usable = records.filter((r) => r.estimated > 0 && r.actual > 0);
  const forCourse = courseId
    ? usable.filter((r) => r.courseId === courseId)
    : [];
  const pool = forCourse.length >= 3 ? forCourse : usable;
  if (pool.length < 3) return 1.0;
  const ratio = median(pool.map((r) => r.actual / r.estimated));
  return Math.min(2, Math.max(0.5, ratio));
}

function roundTo5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

export function estimateMinutes(
  input: EstimateInput,
  records: EstimateRecord[] = [],
  courseId?: string | null,
): Estimate {
  const base = BASE_MINUTES[input.kind] ?? 60;
  const difficulty = Math.min(5, Math.max(1, input.difficulty));
  const diffMult = 1 + (difficulty - 3) * 0.25;
  const calibration = calibrationFactor(records, courseId);
  const mid = roundTo5(base * diffMult * calibration);
  const max = roundTo5(mid * 1.4);
  const historyDepth = records.filter((r) => r.courseId === courseId).length;
  const confidence =
    historyDepth >= 5 ? "HIGH" : historyDepth >= 3 ? "MEDIUM" : "LOW";
  return { minutes: mid, minutesMax: max, confidence, calibration };
}
