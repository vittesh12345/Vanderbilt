// Conflict detection between a syllabus extraction and existing records.

import { describe, expect, it } from "vitest";
import { detectConflicts, type ExistingCourseData } from "@/lib/conflicts";
import type { SyllabusExtraction } from "@/lib/types";

function extraction(partial: Partial<SyllabusExtraction> = {}): SyllabusExtraction {
  return {
    courseInfo: {},
    gradeWeights: [],
    dates: [],
    officeHours: [],
    materials: [],
    policies: [],
    objectives: [],
    warnings: [],
    aiUsed: false,
    ...partial,
  };
}

function existing(partial: Partial<ExistingCourseData> = {}): ExistingCourseData {
  return {
    course: { id: "course-1", code: "ECON 2100", gradeWeightsJson: "[]" },
    exams: [],
    assignments: [],
    ...partial,
  };
}

describe("exam date conflicts", () => {
  const examRecord = {
    id: "exam-1",
    title: "Midterm 1",
    kind: "MIDTERM",
    startAt: new Date("2026-10-16T09:00:00"),
    source: "MANUAL",
  };

  it("flags a same-title exam on a different day, with field startAt and the verify suggestion", () => {
    const conflicts = detectConflicts(
      extraction({
        dates: [{ title: "Midterm 1", kind: "EXAM", date: "2026-10-14", confidence: "HIGH" }],
      }),
      existing({ exams: [examRecord] }),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].entityType).toBe("EXAM");
    expect(conflicts[0].entityId).toBe("exam-1");
    expect(conflicts[0].field).toBe("startAt");
    expect(conflicts[0].suggestion).toBe("Verify with professor.");
  });

  it("stays quiet when the dates fall on the same day", () => {
    const conflicts = detectConflicts(
      extraction({
        dates: [{ title: "Midterm 1", kind: "EXAM", date: "2026-10-16", confidence: "HIGH" }],
      }),
      existing({ exams: [examRecord] }),
    );
    expect(conflicts).toHaveLength(0);
  });
});

describe("assignment due-date conflicts", () => {
  it("matches loosely on title (parser residue vs clean record) and flags the dueAt mismatch", () => {
    const conflicts = detectConflicts(
      extraction({
        dates: [
          {
            title: "Problem Set 3 due",
            kind: "ASSIGNMENT",
            date: "2026-10-21",
            time: "23:59",
            confidence: "HIGH",
          },
        ],
      }),
      existing({
        assignments: [
          {
            id: "assign-1",
            title: "Problem Set 3",
            dueAt: new Date("2026-10-23T23:59:00"),
            source: "MANUAL",
          },
        ],
      }),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].entityType).toBe("ASSIGNMENT");
    expect(conflicts[0].entityId).toBe("assign-1");
    expect(conflicts[0].field).toBe("dueAt");
  });
});

describe("grade-weight conflicts", () => {
  const stored = existing({
    course: {
      id: "course-1",
      code: "ECON 2100",
      gradeWeightsJson: JSON.stringify([{ category: "Exams", weight: 40 }]),
    },
  });

  it("flags a matching category differing by more than 2 points", () => {
    const conflicts = detectConflicts(
      extraction({
        gradeWeights: [{ category: "Exams", weight: 45, confidence: "HIGH" }],
      }),
      stored,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].entityType).toBe("COURSE");
    expect(conflicts[0].field).toBe("gradeWeights");
    expect(conflicts[0].valueA).toBe("45%");
    expect(conflicts[0].valueB).toBe("40%");
  });

  it("tolerates a difference of 2 points or less", () => {
    const conflicts = detectConflicts(
      extraction({
        gradeWeights: [{ category: "Exams", weight: 42, confidence: "HIGH" }],
      }),
      stored,
    );
    expect(conflicts).toHaveLength(0);
  });
});
