// Conflict detection between an incoming syllabus extraction and existing
// records. When two sources disagree, we NEVER silently pick one — we create
// a Conflict row that surfaces in alerts and on the syllabus page until the
// user resolves it.

import { format, isSameDay } from "date-fns";
import { parseJson } from "@/lib/json";
import type { GradeWeight, SyllabusExtraction } from "@/lib/types";

export interface ConflictCandidate {
  entityType: "COURSE" | "ASSIGNMENT" | "EXAM";
  entityId?: string;
  field: string;
  description: string;
  sourceA: string;
  valueA: string;
  sourceB: string;
  valueB: string;
  suggestion: string;
}

export interface ExistingCourseData {
  course: {
    id: string;
    code: string;
    gradeWeightsJson: string;
  };
  exams: { id: string; title: string; kind: string; startAt: Date; source: string }[];
  assignments: { id: string; title: string; dueAt: Date | null; source: string }[];
}

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** ExtractedDate.date may be YYYY-MM-DD or a full ISO datetime. */
function toDate(date: string, fallbackTime: string): Date {
  return date.includes("T")
    ? new Date(date)
    : new Date(`${date}T${fallbackTime}:00`);
}

/** Loose title match: exact normalized, or one contains the other. */
function titlesMatch(a: string, b: string): boolean {
  const na = normTitle(a);
  const nb = normTitle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function detectConflicts(
  extraction: SyllabusExtraction,
  existing: ExistingCourseData,
  sourceLabel = "Syllabus",
): ConflictCandidate[] {
  const conflicts: ConflictCandidate[] = [];

  // Exam/quiz date disagreements.
  for (const d of extraction.dates) {
    if (d.kind !== "EXAM" && d.kind !== "QUIZ") continue;
    const incoming = toDate(d.date, d.time ?? "09:00");
    if (isNaN(incoming.getTime())) continue;
    for (const exam of existing.exams) {
      if (!titlesMatch(d.title, `${exam.title}`) && !titlesMatch(d.title, `${exam.kind}`))
        continue;
      if (!isSameDay(exam.startAt, incoming)) {
        conflicts.push({
          entityType: "EXAM",
          entityId: exam.id,
          field: "startAt",
          description: `${existing.course.code} "${exam.title}" date differs between sources`,
          sourceA: sourceLabel,
          valueA: d.date.slice(0, 10),
          sourceB: exam.source === "MANUAL" ? "Existing record" : `Existing record (${exam.source})`,
          valueB: format(exam.startAt, "yyyy-MM-dd"),
          suggestion: "Verify with professor.",
        });
      }
    }
  }

  // Assignment due-date disagreements.
  for (const d of extraction.dates) {
    if (d.kind !== "ASSIGNMENT" && d.kind !== "PROJECT_MILESTONE") continue;
    const incoming = toDate(d.date, d.time ?? "23:59");
    if (isNaN(incoming.getTime())) continue;
    for (const a of existing.assignments) {
      if (!a.dueAt || !titlesMatch(d.title, a.title)) continue;
      if (!isSameDay(a.dueAt, incoming)) {
        conflicts.push({
          entityType: "ASSIGNMENT",
          entityId: a.id,
          field: "dueAt",
          description: `${existing.course.code} "${a.title}" due date differs between sources`,
          sourceA: sourceLabel,
          valueA: d.date.slice(0, 10),
          sourceB: a.source === "MANUAL" ? "Existing record" : `Existing record (${a.source})`,
          valueB: format(a.dueAt, "yyyy-MM-dd"),
          suggestion: "Verify with professor.",
        });
      }
    }
  }

  // Grade-weight disagreements (>2 percentage points on a matching category).
  const existingWeights = parseJson<GradeWeight[]>(existing.course.gradeWeightsJson, []);
  for (const g of extraction.gradeWeights) {
    for (const ex of existingWeights) {
      if (!titlesMatch(g.category, ex.category)) continue;
      if (Math.abs(g.weight - ex.weight) > 2) {
        conflicts.push({
          entityType: "COURSE",
          entityId: existing.course.id,
          field: "gradeWeights",
          description: `${existing.course.code} grade weighting for "${ex.category}" differs between sources`,
          sourceA: sourceLabel,
          valueA: `${g.weight}%`,
          sourceB: "Existing record",
          valueB: `${ex.weight}%`,
          suggestion: "Check the latest syllabus version or ask the professor.",
        });
      }
    }
  }

  return conflicts;
}
