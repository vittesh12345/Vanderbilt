// Priority engine ("What should I do?") — pure-function tests with a fixed clock.

import { describe, expect, it } from "vitest";
import {
  rankActions,
  scoreCandidate,
  topActions,
  type PriorityCandidate,
} from "@/lib/engine/priority";

const NOW = new Date("2026-09-14T09:00:00"); // Monday morning

function daysFromNow(n: number, time = "17:00:00"): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  const [h, m, s] = time.split(":").map(Number);
  d.setHours(h, m, s, 0);
  return d;
}

function candidate(overrides: Partial<PriorityCandidate> = {}): PriorityCandidate {
  return {
    id: "c-base",
    entityType: "ASSIGNMENT",
    title: "Worksheet 1",
    ...overrides,
  };
}

describe("scoreCandidate — urgency", () => {
  it("scores due-tomorrow above due-next-week, all else equal", () => {
    const tomorrow = scoreCandidate(
      candidate({ id: "a", dueAt: daysFromNow(1) }),
      { now: NOW },
    );
    const nextWeek = scoreCandidate(
      candidate({ id: "b", dueAt: daysFromNow(7) }),
      { now: NOW },
    );
    expect(tomorrow.score).toBeGreaterThan(nextWeek.score);
    // Exact urgency buckets: 1 day → 34 pts, 7 days → 8 pts.
    expect(tomorrow.score).toBe(34);
    expect(nextWeek.score).toBe(8);
  });
});

describe("scoreCandidate — big-later work can outrank small-tomorrow work", () => {
  // Engine math, verified by hand:
  //   Project (300 min, due in 6 days, 10% of grade, importance 5, difficulty 5):
  //     urgency 8 + pace min(30, (300/6)/6)=8.33 + weight min(20, 10*0.6)=6
  //     + importance (5-3)*4=8 + difficulty (5-3)*2=4  → 34.3
  //   Reading (15 min, due tomorrow, no grade weight, importance 2, difficulty 2):
  //     urgency 34 + pace (15/1)/6=2.5 + importance -4 + difficulty -2 → 30.5
  it("ranks a heavy 300-min project due in 6 days above a 15-min low-stakes reading due tomorrow", () => {
    const project = candidate({
      id: "project",
      title: "Course project",
      dueAt: daysFromNow(6),
      estMinutes: 300,
      gradeWeight: 10,
      importance: 5,
      difficulty: 5,
    });
    const reading = candidate({
      id: "reading",
      title: "Skim handout",
      entityType: "ASSIGNMENT",
      dueAt: daysFromNow(1),
      estMinutes: 15,
      importance: 2,
      difficulty: 2,
    });
    const ranked = rankActions([reading, project], { now: NOW });
    expect(ranked[0].id).toBe("project");
    expect(ranked[0].score).toBeCloseTo(34.3, 1);
    expect(ranked[1].score).toBeCloseTo(30.5, 1);
  });
});

describe("scoreCandidate — status and dependencies", () => {
  it("sinks BLOCKED work below identical actionable work and says why", () => {
    const open = scoreCandidate(
      candidate({ id: "open", dueAt: daysFromNow(1), status: "NOT_STARTED" }),
      { now: NOW },
    );
    const blocked = scoreCandidate(
      candidate({ id: "blocked", dueAt: daysFromNow(1), status: "BLOCKED" }),
      { now: NOW },
    );
    expect(blocked.score).toBeLessThan(open.score);
    expect(blocked.score).toBe(open.score - 50);
    expect(blocked.reason.toLowerCase()).toContain("blocked");
  });

  it("penalizes dependenciesMet: false by 30 points", () => {
    const free = scoreCandidate(
      candidate({ id: "free", dueAt: daysFromNow(2) }),
      { now: NOW },
    );
    const gated = scoreCandidate(
      candidate({ id: "gated", dueAt: daysFromNow(2), dependenciesMet: false }),
      { now: NOW },
    );
    expect(gated.score).toBe(free.score - 30);
    expect(gated.reason).toContain("waiting on a prerequisite");
  });
});

describe("scoreCandidate — personal priority tiers", () => {
  it("gives a tier-1 category the edge over an identical tier-less candidate", () => {
    const ctx = { now: NOW, tier1: ["STARTUP"], tier2: ["CLUB"] };
    const tiered = scoreCandidate(
      candidate({ id: "t1", category: "STARTUP", dueAt: daysFromNow(3) }),
      ctx,
    );
    const plain = scoreCandidate(
      candidate({ id: "plain", dueAt: daysFromNow(3) }),
      ctx,
    );
    expect(tiered.score).toBe(plain.score + 6);
    expect(tiered.score).toBeGreaterThan(plain.score);
  });
});

describe("topActions", () => {
  const positives: PriorityCandidate[] = [
    candidate({ id: "p1", dueAt: daysFromNow(1) }),
    candidate({ id: "p2", dueAt: daysFromNow(2) }),
    candidate({ id: "p3", dueAt: daysFromNow(3) }),
  ];
  // Far-future + blocked: urgency 1 - 50 = -49 → must never surface.
  const sunk = candidate({ id: "sunk", dueAt: daysFromNow(20), status: "BLOCKED" });

  it("returns at most n actions", () => {
    expect(topActions([...positives, sunk], 2, { now: NOW })).toHaveLength(2);
  });

  it("excludes candidates with score <= 0 even when n has room", () => {
    const top = topActions([...positives, sunk], 10, { now: NOW });
    expect(top).toHaveLength(3);
    expect(top.map((a) => a.id)).not.toContain("sunk");
  });
});

describe("reasons", () => {
  it("every ranked action carries a non-empty human-readable reason", () => {
    const ranked = rankActions(
      [
        candidate({ id: "r1", dueAt: daysFromNow(1), estMinutes: 120, gradeWeight: 15 }),
        candidate({ id: "r2" }), // undated, bland → "routine work"
        candidate({ id: "r3", dueAt: daysFromNow(30), status: "BLOCKED" }),
      ],
      { now: NOW },
    );
    for (const action of ranked) {
      expect(typeof action.reason).toBe("string");
      expect(action.reason.length).toBeGreaterThan(0);
    }
  });
});
