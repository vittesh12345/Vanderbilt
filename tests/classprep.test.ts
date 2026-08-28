// Class-prep engine — next meeting resolution + the pre-class brief.

import { describe, expect, it } from "vitest";
import {
  buildClassPrep,
  nextMeeting,
  type ClassPrepInput,
} from "@/lib/engine/classprep";

const NOW = new Date("2026-09-14T10:30:00"); // Monday 10:30 AM

const MEETINGS = [
  { dayOfWeek: 1, startTime: "09:00", endTime: "10:15", kind: "LECTURE" }, // Mon (already started)
  { dayOfWeek: 3, startTime: "13:00", endTime: "14:15", kind: "LECTURE" }, // Wed
  { dayOfWeek: 5, startTime: "09:00", endTime: "10:15", kind: "DISCUSSION" }, // Fri
];

function input(overrides: Partial<ClassPrepInput> = {}): ClassPrepInput {
  return {
    courseId: "course-1",
    courseCode: "ECON 2100",
    courseTitle: "Intermediate Microeconomics",
    now: NOW,
    meetings: MEETINGS,
    openAssignments: [],
    topics: [],
    ...overrides,
  };
}

describe("nextMeeting", () => {
  it("skips today's already-started meeting and picks the soonest future one", () => {
    const meeting = nextMeeting(MEETINGS, NOW);
    expect(meeting).not.toBeNull();
    // Monday 9:00 already began → Wednesday 1:00 PM wins over Friday.
    expect(meeting!.start.getTime()).toBe(new Date("2026-09-16T13:00:00").getTime());
    expect(meeting!.kind).toBe("LECTURE");
  });

  it("still picks today's meeting when it has not started yet", () => {
    const earlyMonday = new Date("2026-09-14T07:00:00");
    const meeting = nextMeeting(MEETINGS, earlyMonday);
    expect(meeting!.start.getTime()).toBe(new Date("2026-09-14T09:00:00").getTime());
  });
});

describe("buildClassPrep", () => {
  const assignments: ClassPrepInput["openAssignments"] = [
    {
      id: "read-1",
      title: "Read Chapter 5, pages 88–112",
      kind: "READING",
      dueAt: new Date("2026-09-15T23:59:00"), // before Wed meeting
      estMinutes: 45,
      status: "NOT_STARTED",
    },
    {
      id: "ps-1",
      title: "Problem Set 3",
      kind: "PROBLEM_SET",
      dueAt: new Date("2026-09-16T13:00:00"), // due at the meeting
      estMinutes: 120,
      status: "IN_PROGRESS",
    },
    {
      id: "later-1",
      title: "Essay outline",
      kind: "ESSAY",
      dueAt: new Date("2026-09-21T23:59:00"), // after the cutoff
      estMinutes: 60,
      status: "NOT_STARTED",
    },
  ];

  const topics: ClassPrepInput["topics"] = [
    { name: "Demand basics", mastery: "MASTERED", confusions: [] },
    { name: "Elasticity", mastery: "NEEDS_REVIEW", confusions: [] },
    { name: "Consumer surplus", mastery: "NEEDS_REVIEW", confusions: ["Why is welfare loss triangular?"] },
    { name: "Producer theory", mastery: "NEEDS_REVIEW", confusions: [] },
  ];

  const prep = buildClassPrep(input({ openAssignments: assignments, topics }));

  it("includes a due READING as a READING item and other due work as a Complete: item", () => {
    expect(prep).not.toBeNull();
    const reading = prep!.items.find((i) => i.sourceId === "read-1");
    expect(reading).toBeDefined();
    expect(reading!.kind).toBe("READING");
    expect(reading!.label).toBe("Read Chapter 5, pages 88–112");

    const pset = prep!.items.find((i) => i.sourceId === "ps-1");
    expect(pset).toBeDefined();
    expect(pset!.kind).toBe("ASSIGNMENT");
    expect(pset!.label).toBe("Complete: Problem Set 3");
  });

  it("excludes assignments due after the meeting cutoff", () => {
    expect(prep!.items.some((i) => i.sourceId === "later-1")).toBe(false);
  });

  it("adds at most 2 NEEDS_REVIEW review items at 20 minutes each", () => {
    const reviews = prep!.items.filter((i) => i.kind === "REVIEW");
    expect(reviews).toHaveLength(2);
    expect(reviews.every((r) => r.estMinutes === 20)).toBe(true);
    expect(reviews[0].label).toContain("Elasticity");
  });

  it("writes a non-empty brief that mentions a weak topic", () => {
    expect(prep!.brief.length).toBeGreaterThan(0);
    expect(prep!.brief).toContain("Elasticity");
  });

  it("totals the item minutes", () => {
    // 45 (reading) + 120 (pset) + 20 + 20 (reviews) = 205
    expect(prep!.totalMinutes).toBe(205);
  });

  it("returns null when the course has no meetings", () => {
    expect(buildClassPrep(input({ meetings: [] }))).toBeNull();
  });
});
