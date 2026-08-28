// Time-estimation engine — baselines, difficulty, calibration from history.

import { describe, expect, it } from "vitest";
import {
  calibrationFactor,
  estimateMinutes,
  type EstimateRecord,
} from "@/lib/engine/estimate";

function records(
  n: number,
  ratio: number,
  courseId: string | null = null,
): EstimateRecord[] {
  return Array.from({ length: n }, () => ({
    courseId,
    estimated: 100,
    actual: 100 * ratio,
  }));
}

describe("estimateMinutes — heuristics", () => {
  it("orders kind baselines: PROJECT > READING", () => {
    const project = estimateMinutes({ kind: "PROJECT", difficulty: 3 });
    const reading = estimateMinutes({ kind: "READING", difficulty: 3 });
    expect(project.minutes).toBeGreaterThan(reading.minutes);
    expect(project.minutes).toBe(300);
    expect(reading.minutes).toBe(60);
  });

  it("raises the estimate for hard work and lowers it for easy work", () => {
    const base = estimateMinutes({ kind: "HOMEWORK", difficulty: 3 });
    const hard = estimateMinutes({ kind: "HOMEWORK", difficulty: 5 });
    const easy = estimateMinutes({ kind: "HOMEWORK", difficulty: 1 });
    expect(hard.minutes).toBeGreaterThan(base.minutes);
    expect(easy.minutes).toBeLessThan(base.minutes);
    expect(hard.minutes).toBe(135); // 90 × 1.5
    expect(easy.minutes).toBe(45); // 90 × 0.5
  });

  it("always reports a range: minutesMax > minutes", () => {
    for (const kind of ["HOMEWORK", "PROJECT", "READING", "ESSAY"] as const) {
      const est = estimateMinutes({ kind, difficulty: 3 });
      expect(est.minutesMax).toBeGreaterThan(est.minutes);
    }
  });
});

describe("calibrationFactor", () => {
  it("returns 1.0 with fewer than 3 usable records", () => {
    expect(calibrationFactor([])).toBe(1.0);
    expect(calibrationFactor(records(2, 1.8))).toBe(1.0);
  });

  it("uses the course's own records when it has at least 3", () => {
    const mixed = [...records(3, 1.5, "c1"), ...records(3, 1.0, "other")];
    expect(calibrationFactor(mixed, "c1")).toBeCloseTo(1.5, 5);
  });

  it("falls back to the global pool when the course has too little history", () => {
    const mixed = [...records(3, 1.5, "c1"), ...records(3, 1.0, "other")];
    // "c2" has no records → median over all 6 → (1.0 + 1.5) / 2 = 1.25.
    expect(calibrationFactor(mixed, "c2")).toBeCloseTo(1.25, 5);
  });

  it("clamps to [0.5, 2]", () => {
    expect(calibrationFactor(records(3, 4.0, "c1"), "c1")).toBe(2);
    expect(calibrationFactor(records(3, 0.2, "c1"), "c1")).toBe(0.5);
  });
});

describe("estimateMinutes — calibration and confidence", () => {
  it("applies the calibration multiplier to the estimate", () => {
    const history = records(3, 2.0, "c1");
    const est = estimateMinutes({ kind: "PROJECT", difficulty: 3 }, history, "c1");
    expect(est.calibration).toBe(2);
    expect(est.minutes).toBe(600); // 300 × 2
    expect(est.minutesMax).toBe(840); // 600 × 1.4
    expect(est.minutesMax).toBeGreaterThan(est.minutes);
  });

  it("confidence rises with course history depth", () => {
    const none = estimateMinutes({ kind: "HOMEWORK", difficulty: 3 }, [], "c1");
    const some = estimateMinutes(
      { kind: "HOMEWORK", difficulty: 3 },
      records(3, 1.1, "c1"),
      "c1",
    );
    const deep = estimateMinutes(
      { kind: "HOMEWORK", difficulty: 3 },
      records(5, 1.1, "c1"),
      "c1",
    );
    expect(none.confidence).toBe("LOW");
    expect(some.confidence).toBe("MEDIUM");
    expect(deep.confidence).toBe("HIGH");
  });

  it("ignores history from other courses when judging confidence", () => {
    const est = estimateMinutes(
      { kind: "HOMEWORK", difficulty: 3 },
      records(5, 1.1, "other"),
      "c1",
    );
    expect(est.confidence).toBe("LOW");
  });
});
