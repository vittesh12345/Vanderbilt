// Alert engine — derived alerts from a fixed clock and plain inputs.

import { describe, expect, it } from "vitest";
import { computeAlerts, type AlertInputs } from "@/lib/engine/alerts";
import type { HeavyWeek } from "@/lib/types";

const NOW = new Date("2026-09-14T09:00:00");
const TODAY_BUCKET = "2026-09-14";

function day(n: number, time = "17:00:00"): Date {
  const d = new Date(`2026-09-14T${time}`);
  d.setDate(d.getDate() + n);
  return d;
}

function inputs(overrides: Partial<AlertInputs> = {}): AlertInputs {
  return {
    now: NOW,
    assignments: [],
    exams: [],
    tasks: [],
    openConflicts: [],
    heavyWeeks: [],
    needsReviewTopics: [],
    ...overrides,
  };
}

function assignment(id: string, dueInDays: number, status = "NOT_STARTED") {
  return {
    id,
    title: `Assignment ${id}`,
    courseCode: "ECON 2100",
    dueAt: day(dueInDays),
    status,
  };
}

const heavyWeek: HeavyWeek = {
  start: day(3),
  end: day(9),
  assignments: 4,
  quizzes: 1,
  exams: 2,
  applications: 0,
  recommendations: ["Start ECON 2100 review 7 days early."],
};

describe("deadline tiers", () => {
  const cases: [number, string, string][] = [
    [0, "DUE_TODAY", "URGENT"],
    [1, "DEADLINE_1D", "URGENT"],
    [3, "DEADLINE_3D", "WARNING"],
    [7, "DEADLINE_7D", "INFO"],
  ];
  for (const [days, kind, severity] of cases) {
    it(`maps an assignment due in ${days} day(s) to ${kind}/${severity}`, () => {
      const alerts = computeAlerts(inputs({ assignments: [assignment("a1", days)] }));
      expect(alerts).toHaveLength(1);
      expect(alerts[0].kind).toBe(kind);
      expect(alerts[0].severity).toBe(severity);
    });
  }

  it("raises nothing for deadlines beyond 7 days", () => {
    const alerts = computeAlerts(inputs({ assignments: [assignment("a1", 8)] }));
    expect(alerts).toHaveLength(0);
  });

  it("flags overdue open work as OVERDUE/URGENT", () => {
    const alerts = computeAlerts(inputs({ assignments: [assignment("a1", -2)] }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("OVERDUE");
    expect(alerts[0].severity).toBe("URGENT");
  });

  it("ignores completed and submitted assignments entirely", () => {
    const alerts = computeAlerts(
      inputs({
        assignments: [
          assignment("done", 0, "COMPLETED"),
          assignment("sent", 1, "SUBMITTED"),
        ],
      }),
    );
    expect(alerts).toHaveLength(0);
  });

  it("embeds today's date bucket in deadline-tier keys", () => {
    const alerts = computeAlerts(inputs({ assignments: [assignment("a1", 1)] }));
    expect(alerts[0].key).toContain(TODAY_BUCKET);
    expect(alerts[0].key).toContain("a1");
  });
});

describe("exam alerts", () => {
  function exam(id: string, inDays: number, planGeneratedAt: Date | null) {
    return {
      id,
      title: "Midterm 1",
      courseCode: "ECON 2100",
      startAt: day(inDays),
      planGeneratedAt,
    };
  }

  it("raises UNPLANNED_EXAM for an exam within 7 days without a plan — WARNING beyond 3 days", () => {
    const alerts = computeAlerts(inputs({ exams: [exam("e1", 5, null)] }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("UNPLANNED_EXAM");
    expect(alerts[0].severity).toBe("WARNING");
  });

  it("escalates UNPLANNED_EXAM to URGENT within 3 days", () => {
    const alerts = computeAlerts(inputs({ exams: [exam("e1", 2, null)] }));
    expect(alerts[0].kind).toBe("UNPLANNED_EXAM");
    expect(alerts[0].severity).toBe("URGENT");
  });

  it("raises EXAM_SOON for a planned exam within 3 days", () => {
    const alerts = computeAlerts(
      inputs({ exams: [exam("e1", 2, new Date("2026-09-10T12:00:00"))] }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("EXAM_SOON");
    expect(alerts[0].severity).toBe("WARNING");
  });

  it("stays quiet for a planned exam more than 3 days out", () => {
    const alerts = computeAlerts(
      inputs({ exams: [exam("e1", 5, new Date("2026-09-10T12:00:00"))] }),
    );
    expect(alerts).toHaveLength(0);
  });
});

describe("aggregate alerts", () => {
  it("carries the counts in a heavy-week alert body", () => {
    const alerts = computeAlerts(inputs({ heavyWeeks: [heavyWeek] }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("HEAVY_WEEK");
    expect(alerts[0].body).toContain("4 assignments");
    expect(alerts[0].body).toContain("2 exams");
  });

  it("carries the suggestion in a conflict alert body", () => {
    const alerts = computeAlerts(
      inputs({
        openConflicts: [
          { id: "c1", description: "Midterm date differs", suggestion: "Verify with professor." },
        ],
      }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("CONFLICT");
    expect(alerts[0].body).toContain("Verify with professor.");
  });

  it("fires overcommitment only when planned exceeds the budget", () => {
    const over = computeAlerts(
      inputs({ plannedWeekMinutes: 500, weeklyBudgetMinutes: 400 }),
    );
    expect(over).toHaveLength(1);
    expect(over[0].kind).toBe("OVERCOMMITMENT");
    expect(over[0].body).toContain("25%");

    const atBudget = computeAlerts(
      inputs({ plannedWeekMinutes: 400, weeklyBudgetMinutes: 400 }),
    );
    expect(atBudget).toHaveLength(0);
  });
});

describe("mixed input", () => {
  const mixed = inputs({
    assignments: [assignment("a1", 0), assignment("a2", 0), assignment("a3", 3)],
    tasks: [
      { id: "t1", title: "Update resume", category: "CAREER", dueAt: day(1), status: "NOT_STARTED" },
    ],
    exams: [
      { id: "e1", title: "Midterm 1", courseCode: "ECON 2100", startAt: day(2), planGeneratedAt: null },
      { id: "e2", title: "Quiz 3", courseCode: "BSCI 1510", startAt: day(3), planGeneratedAt: new Date("2026-09-10T12:00:00") },
    ],
    openConflicts: [
      { id: "c1", description: "Date differs", suggestion: "Verify with professor." },
      { id: "c2", description: "Weights differ", suggestion: null },
    ],
    heavyWeeks: [heavyWeek],
    needsReviewTopics: [
      { id: "n1", name: "Elasticity", courseCode: "ECON 2100" },
      { id: "n2", name: "Game theory", courseCode: "ECON 2100" },
      { id: "n3", name: "Meiosis", courseCode: "BSCI 1510" },
    ],
    plannedWeekMinutes: 900,
    weeklyBudgetMinutes: 600,
  });

  it("produces unique keys across every alert kind", () => {
    const alerts = computeAlerts(mixed);
    expect(alerts.length).toBeGreaterThanOrEqual(10);
    expect(new Set(alerts.map((a) => a.key)).size).toBe(alerts.length);
  });

  it("orders URGENT before WARNING before INFO", () => {
    const rank = { URGENT: 0, WARNING: 1, INFO: 2 } as const;
    const alerts = computeAlerts(mixed);
    expect(alerts.some((a) => a.severity === "URGENT")).toBe(true);
    expect(alerts.some((a) => a.severity === "WARNING")).toBe(true);
    expect(alerts.some((a) => a.severity === "INFO")).toBe(true);
    for (let i = 1; i < alerts.length; i++) {
      expect(rank[alerts[i].severity]).toBeGreaterThanOrEqual(rank[alerts[i - 1].severity]);
    }
  });
});
