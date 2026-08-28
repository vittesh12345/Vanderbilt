// Regression tests for defects found in the adversarial review pass.
// Each case pins a specific fixed behavior.

import { describe, expect, it } from "vitest";
import { dueLabel, parseDateInput } from "@/lib/dates";
import { buildStudyPlan, recommendedPrepMinutes } from "@/lib/engine/studyplan";
import { detectHeavyWeeks } from "@/lib/engine/workload";
import { parseSyllabus } from "@/lib/parsers/syllabus";

const NOW = new Date("2026-09-14T09:00:00");

describe("dueLabel", () => {
  it("does not render an item exactly 7 days out as a bare weekday", () => {
    const due = new Date("2026-09-21T23:59:00"); // same weekday as NOW
    expect(dueLabel(due, NOW)).toBe("due Sep 21");
  });

  it("still uses the weekday inside the week", () => {
    expect(dueLabel(new Date("2026-09-18T23:59:00"), NOW)).toMatch(/due Friday/);
  });
});

describe("parseDateInput", () => {
  it("treats a bare YYYY-MM-DD as LOCAL time, not UTC midnight", () => {
    const d = parseDateInput("2026-09-05", "23:59");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(8);
    expect(d!.getDate()).toBe(5); // local calendar day preserved in every TZ
    expect(d!.getHours()).toBe(23);
  });

  it("passes full ISO datetimes through and rejects garbage", () => {
    expect(parseDateInput("2026-09-05T10:30:00.000Z")!.toISOString()).toBe(
      "2026-09-05T10:30:00.000Z",
    );
    expect(parseDateInput("not-a-date")).toBeNull();
    expect(parseDateInput(null)).toBeNull();
  });
});

describe("studyplan low-stakes totals", () => {
  it("does not inflate a small quiz plan far above its own recommendation", () => {
    const input = {
      examId: "q",
      examTitle: "Quiz",
      courseCode: "MATH 1301",
      kind: "QUIZ" as const,
      startAt: new Date("2026-09-22T09:30:00"),
      weight: 4,
      courseDifficulty: 3,
      topics: ["Limits"],
      now: NOW,
    };
    const { minutes: recommended } = recommendedPrepMinutes(input);
    const plan = buildStudyPlan(input);
    // Old bug: per-day 15-minute floors summed to 2–3× the recommendation.
    expect(plan.totalMinutes).toBeLessThanOrEqual(recommended + 30);
  });
});

describe("heavy-week window boundary", () => {
  it("does not treat two exams 7 days apart as one heavy 7-day window", () => {
    const mk = (offset: number) => {
      const d = new Date(NOW);
      d.setDate(d.getDate() + offset);
      d.setHours(14, 0, 0, 0);
      return d;
    };
    const weeks = detectHeavyWeeks({
      now: NOW,
      horizonDays: 28,
      classMeetings: [],
      assignments: [],
      exams: [
        { id: "a", title: "M1", courseCode: "A", startAt: mk(0), kind: "MIDTERM" },
        { id: "b", title: "M2", courseCode: "B", startAt: mk(7), kind: "MIDTERM" },
      ],
      sessions: [],
    });
    expect(weeks).toEqual([]);
  });
});

describe("syllabus parser regressions", () => {
  it("does not read chapter/section fractions as numeric dates", () => {
    const e = parseSyllabus(
      "Course Schedule\nHomework on sections 3/4 due October 2\n",
      { defaultYear: 2026, now: NOW },
    );
    expect(e.dates).toHaveLength(1);
    expect(e.dates[0].date).toBe("2026-10-02");
  });

  it("takes the START of a time range, inheriting the trailing meridiem", () => {
    const e = parseSyllabus("Final Exam — December 12, 7:00-9:00 pm\n", {
      defaultYear: 2026,
      now: NOW,
    });
    expect(e.dates[0].time).toBe("19:00");
  });

  it("resolves an AM start when an inherited PM would cross the range end", () => {
    const e = parseSyllabus("Midterm 1 — October 14, 11:00-1:00 pm\n", {
      defaultYear: 2026,
      now: NOW,
    });
    expect(e.dates[0].time).toBe("11:00");
  });

  it("skips impossible calendar dates with a warning instead of rolling them over", () => {
    const e = parseSyllabus("Course Schedule\nMidterm 2 — February 30\n", {
      defaultYear: 2026,
      now: NOW,
    });
    expect(e.dates).toHaveLength(0);
    expect(e.warnings.some((w) => w.includes("impossible date"))).toBe(true);
  });

  it("parses numbered grade categories and meridiem-less office-hour ends", () => {
    const e = parseSyllabus(
      "Grading\nMidterm 1: 20%\nMidterm 2: 20%\nFinal Exam: 35%\nProblem Sets: 15%\nParticipation: 10%\nOffice Hours: Tuesdays 2:00-3:30, Calhoun 316\n",
      { defaultYear: 2026, now: NOW },
    );
    expect(e.gradeWeights).toHaveLength(5);
    expect(e.warnings.some((w) => w.includes("sum"))).toBe(false);
    expect(e.officeHours).toHaveLength(1);
    expect(e.officeHours[0].end).toBe("3:30");
  });
});
