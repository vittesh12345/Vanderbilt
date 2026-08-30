// Study-plan engine — fixed clock, deterministic inputs.

import { describe, expect, it } from "vitest";
import {
  buildStudyPlan,
  recommendedPrepMinutes,
  type StudyPlanInput,
} from "@/lib/engine/studyplan";

const NOW = new Date("2026-09-14T09:00:00");

function input(overrides: Partial<StudyPlanInput> = {}): StudyPlanInput {
  return {
    examId: "exam-1",
    examTitle: "Midterm 1",
    courseCode: "ECON 2100",
    kind: "MIDTERM",
    startAt: new Date("2026-09-20T09:00:00"), // 6 calendar days out
    weight: 25,
    topics: ["Elasticity", "Consumer surplus", "Producer theory", "Game theory", "Externalities"],
    weakTopics: ["Game theory"],
    now: NOW,
    ...overrides,
  };
}

describe("recommendedPrepMinutes", () => {
  it("recommends more prep for a 30% exam than a 10% exam of the same kind", () => {
    const heavy = recommendedPrepMinutes(input({ weight: 30, weakTopics: [], topics: ["A"] }));
    const light = recommendedPrepMinutes(input({ weight: 10, weakTopics: [], topics: ["A"] }));
    expect(heavy.minutes).toBeGreaterThan(light.minutes);
    // MIDTERM base 360: ×1.25 → 450 vs ×1 → 360.
    expect(heavy.minutes).toBe(450);
    expect(light.minutes).toBe(360);
  });

  it("adds minutes for weak topics", () => {
    const withWeak = recommendedPrepMinutes(input({ weakTopics: ["A", "B"] }));
    const without = recommendedPrepMinutes(input({ weakTopics: [] }));
    expect(withWeak.minutes).toBeGreaterThan(without.minutes);
    expect(withWeak.rationale).toContain("needs review");
  });
});

describe("buildStudyPlan — shape and invariants", () => {
  const plan = buildStudyPlan(input());

  it("sorts sessions ascending by date", () => {
    for (let i = 1; i < plan.sessions.length; i++) {
      expect(plan.sessions[i].date.getTime()).toBeGreaterThanOrEqual(
        plan.sessions[i - 1].date.getTime(),
      );
    }
  });

  it("ends with a short exam-day recall session (<= 45 min)", () => {
    const last = plan.sessions[plan.sessions.length - 1];
    expect(last.daysBeforeExam).toBe(0);
    expect(last.minutes).toBeLessThanOrEqual(45);
    expect(last.date.getTime()).toBe(new Date("2026-09-20T00:00:00").getTime());
  });

  it("keeps every session within the default 150-minute cap, even when demand overflows", () => {
    // FINAL, difficulty 5, weight 30, only 3 days out: 600×1.4×1.25 = 1050 min
    // wanted but only 3 study days × 150 available.
    const crammed = buildStudyPlan(
      input({
        kind: "FINAL",
        courseDifficulty: 5,
        weight: 30,
        startAt: new Date("2026-09-17T09:00:00"),
        weakTopics: [],
        topics: ["A", "B"],
      }),
    );
    for (const s of crammed.sessions) {
      if (s.daysBeforeExam > 0) expect(s.minutes).toBeLessThanOrEqual(150);
    }
    expect(plan.sessions.every((s) => s.minutes <= 150)).toBe(true);
  });

  it("reports totalMinutes equal to the sum of its sessions", () => {
    const sum = plan.sessions.reduce((s, x) => s + x.minutes, 0);
    expect(plan.totalMinutes).toBe(sum);
  });

  it("ramps intensity: a later study day is never lighter than an earlier one", () => {
    const study = plan.sessions.filter((s) => s.daysBeforeExam >= 1);
    expect(study.length).toBeGreaterThan(1);
    for (let i = 1; i < study.length; i++) {
      expect(study[i].minutes).toBeGreaterThanOrEqual(study[i - 1].minutes);
    }
  });

  it("spreads topics across early sessions — first session covers the first topic", () => {
    expect(plan.sessions[0].focus).toContain("Elasticity");
  });

  it("explains the weight in the rationale when >= 20%", () => {
    expect(plan.rationale).toContain("25%");
  });
});

describe("buildStudyPlan — edge cases", () => {
  it("yields exactly one recall session when the exam is today", () => {
    const plan = buildStudyPlan(
      input({ startAt: new Date("2026-09-14T15:00:00") }),
    );
    expect(plan.sessions).toHaveLength(1);
    expect(plan.sessions[0].daysBeforeExam).toBe(0);
    expect(plan.sessions[0].minutes).toBeLessThanOrEqual(45);
    expect(plan.totalMinutes).toBe(plan.sessions[0].minutes);
  });

  it("yields an empty plan for a past exam", () => {
    const plan = buildStudyPlan(
      input({ startAt: new Date("2026-09-12T09:00:00") }),
    );
    expect(plan.sessions).toHaveLength(0);
    expect(plan.totalMinutes).toBe(0);
  });
});
