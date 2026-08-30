// Work-session scheduler — fixed clock, deterministic placement.

import { describe, expect, it } from "vitest";
import {
  leadDays,
  planWorkSessions,
  type ScheduleInput,
} from "@/lib/engine/scheduler";

const NOW = new Date("2026-09-14T09:00:00"); // Monday

function input(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    assignmentId: "a1",
    title: "Problem Set 4",
    estMinutes: 180,
    dueAt: new Date("2026-09-18T17:00:00"), // Friday, 4 days out
    now: NOW,
    ...overrides,
  };
}

describe("leadDays", () => {
  it("grows with estimated minutes", () => {
    expect(leadDays(75)).toBe(1);
    expect(leadDays(150)).toBe(2);
    expect(leadDays(300)).toBe(4);
    expect(leadDays(300)).toBeGreaterThan(leadDays(75));
  });

  it("adds a buffer day when difficulty >= 4", () => {
    expect(leadDays(150, 4)).toBe(leadDays(150, 3) + 1);
    expect(leadDays(150, 5)).toBe(3);
    expect(leadDays(150, 2)).toBe(2);
  });
});

describe("planWorkSessions", () => {
  it("plans blocks whose sum covers the estimate (20-minute chunk floor)", () => {
    const exact = planWorkSessions(input({ estMinutes: 180 }));
    expect(exact.reduce((s, b) => s + b.minutes, 0)).toBe(180);

    // A tiny estimate still gets a real 20-minute block.
    const tiny = planWorkSessions(input({ estMinutes: 10 }));
    expect(tiny).toHaveLength(1);
    expect(tiny[0].minutes).toBe(20);

    const uneven = planWorkSessions(input({ estMinutes: 95 }));
    expect(uneven.reduce((s, b) => s + b.minutes, 0)).toBeGreaterThanOrEqual(95);
  });

  it("keeps every block within [today, due day] and under 90 minutes", () => {
    const blocks = planWorkSessions(input());
    const today = new Date("2026-09-14T00:00:00").getTime();
    const dueDay = new Date("2026-09-18T00:00:00").getTime();
    expect(blocks.length).toBeGreaterThan(1);
    for (const b of blocks) {
      expect(b.date.getTime()).toBeGreaterThanOrEqual(today);
      expect(b.date.getTime()).toBeLessThanOrEqual(dueDay);
      expect(b.minutes).toBeLessThanOrEqual(90);
    }
  });

  it("returns blocks sorted ascending by date", () => {
    const blocks = planWorkSessions(input());
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].date.getTime()).toBeGreaterThanOrEqual(blocks[i - 1].date.getTime());
    }
  });

  it("puts the final block of a multi-block plan near the deadline with a finish focus", () => {
    const blocks = planWorkSessions(input({ estMinutes: 180 }));
    const finish = blocks.find((b) => b.focus.startsWith("Finish + submit"));
    expect(finish).toBeDefined();
    // Last block must land on one of the final two candidate days (Thu/Fri).
    expect(finish!.date.getTime()).toBeGreaterThanOrEqual(
      new Date("2026-09-17T00:00:00").getTime(),
    );
    expect(finish!.focus).toContain("Problem Set 4");
  });

  it("avoids a pre-loaded day at the daily cap when an alternative exists", () => {
    // 60 min due Wednesday: candidates are Tue 09-15 and Wed 09-16.
    // Tue is already at the 120-minute cap → the block must land on Wed.
    const blocks = planWorkSessions(
      input({
        estMinutes: 60,
        dueAt: new Date("2026-09-16T23:59:00"),
        existingLoad: new Map([["2026-09-15", 120]]),
      }),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].date.getTime()).toBe(new Date("2026-09-16T00:00:00").getTime());
  });

  it("returns [] for past-due work", () => {
    expect(
      planWorkSessions(input({ dueAt: new Date("2026-09-13T17:00:00") })),
    ).toEqual([]);
  });
});
