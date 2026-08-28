// Workload forecast + heavy-week detection — fixed clock.

import { describe, expect, it } from "vitest";
import {
  detectHeavyWeeks,
  forecastWorkload,
  type WorkloadInputs,
} from "@/lib/engine/workload";

const NOW = new Date("2026-09-14T08:00:00"); // Monday (getDay() === 1)

function day(n: number, time = "09:00:00"): Date {
  const d = new Date(`2026-09-14T${time}`);
  d.setDate(d.getDate() + n);
  return d;
}

function inputs(overrides: Partial<WorkloadInputs> = {}): WorkloadInputs {
  return {
    now: NOW,
    classMeetings: [],
    assignments: [],
    exams: [],
    sessions: [],
    ...overrides,
  };
}

describe("forecastWorkload", () => {
  it("respects the horizon length (explicit and default)", () => {
    expect(forecastWorkload(inputs({ horizonDays: 7 }))).toHaveLength(7);
    expect(forecastWorkload(inputs())).toHaveLength(14);
  });

  it("marks an exam day at least HIGH even with no other minutes", () => {
    const days = forecastWorkload(
      inputs({
        exams: [
          { id: "e1", title: "Midterm 1", courseCode: "ECON 2100", startAt: day(2), kind: "MIDTERM" },
        ],
      }),
    );
    expect(days[2].examCount).toBe(1);
    expect(["HIGH", "VERY_HIGH", "EXTREME"]).toContain(days[2].level);
  });

  it("forecasts LIGHT days for empty inputs", () => {
    const days = forecastWorkload(inputs());
    expect(days.every((d) => d.level === "LIGHT" && d.minutes === 0)).toBe(true);
  });

  it("counts class minutes at half weight — enough to cross a level threshold alone", () => {
    // 200 class minutes × 0.5 = 100 → NORMAL (>= 90); without class, LIGHT.
    const withClass = forecastWorkload(
      inputs({ classMeetings: [{ dayOfWeek: 1, minutes: 200, label: "ECON 2100" }] }),
    );
    expect(withClass[0].classMinutes).toBe(200);
    expect(withClass[0].minutes).toBe(100);
    expect(withClass[0].level).toBe("NORMAL");
    const withoutClass = forecastWorkload(inputs());
    expect(withoutClass[0].level).toBe("LIGHT");
  });

  it("labels exams and due work in the day's notes", () => {
    const days = forecastWorkload(
      inputs({
        exams: [
          { id: "e1", title: "Midterm 1", courseCode: "ECON 2100", startAt: day(2), kind: "MIDTERM" },
        ],
        assignments: [
          { id: "a1", title: "Problem Set 4", courseCode: "ECON 2100", dueAt: day(2, "23:59:00"), estMinutes: 120 },
        ],
      }),
    );
    expect(days[2].notes.some((n) => n.includes("Exam:") && n.includes("Midterm 1"))).toBe(true);
    expect(days[2].notes.some((n) => n.includes("Problem Set 4") && n.includes("due"))).toBe(true);
  });
});

describe("detectHeavyWeeks", () => {
  it("triggers on 2 exams within 7 days and merges the overlapping windows", () => {
    const weeks = detectHeavyWeeks(
      inputs({
        exams: [
          { id: "e1", title: "Midterm 1", courseCode: "ECON 2100", startAt: day(3), kind: "MIDTERM" },
          { id: "e2", title: "Midterm", courseCode: "BSCI 1510", startAt: day(6, "13:00:00"), kind: "MIDTERM" },
        ],
      }),
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0].exams).toBe(2);
  });

  it("triggers on 1 exam + 3 assignments, with concrete recommendations", () => {
    const weeks = detectHeavyWeeks(
      inputs({
        exams: [
          { id: "e1", title: "Midterm 1", courseCode: "ECON 2100", startAt: day(4), kind: "MIDTERM" },
        ],
        assignments: [
          { id: "a1", title: "Essay 2", courseCode: "PHIL 1100", dueAt: day(2, "23:59:00"), estMinutes: 240 },
          { id: "a2", title: "PS4", courseCode: "ECON 2100", dueAt: day(3, "23:59:00"), estMinutes: 120 },
          { id: "a3", title: "Reading response", courseCode: "PHIL 1100", dueAt: day(5, "23:59:00"), estMinutes: 45 },
        ],
      }),
    );
    expect(weeks.length).toBeGreaterThanOrEqual(1);
    expect(weeks[0].exams).toBe(1);
    expect(weeks[0].assignments).toBe(3);
    expect(
      weeks[0].recommendations.some((r) => r.includes("Start ECON 2100 review")),
    ).toBe(true);
    // 240-minute essay → "Start "Essay 2" 4 days early."
    expect(
      weeks[0].recommendations.some((r) => r.includes('Start "Essay 2"') && r.includes("early")),
    ).toBe(true);
  });

  it("does not trigger on sparse load", () => {
    const weeks = detectHeavyWeeks(
      inputs({
        exams: [
          { id: "e1", title: "Quiz 1", courseCode: "ECON 2100", startAt: day(4), kind: "MIDTERM" },
        ],
        assignments: [
          { id: "a1", title: "PS1", courseCode: "ECON 2100", dueAt: day(2, "23:59:00"), estMinutes: 60 },
        ],
      }),
    );
    expect(weeks).toHaveLength(0);
  });

  it("merges overlapping heavy windows into one", () => {
    // Exams 5 days apart: several 7-day windows catch both; merged to one.
    const weeks = detectHeavyWeeks(
      inputs({
        exams: [
          { id: "e1", title: "Midterm 1", courseCode: "ECON 2100", startAt: day(3), kind: "MIDTERM" },
          { id: "e2", title: "Midterm", courseCode: "BSCI 1510", startAt: day(8), kind: "MIDTERM" },
        ],
      }),
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0].exams).toBe(2);
    expect(weeks[0].recommendations).toContain("Start ECON 2100 review 7 days early.");
    expect(weeks[0].recommendations).toContain("Start BSCI 1510 review 7 days early.");
  });
});
