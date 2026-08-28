// The "What should I do?" engine.
//
// Ranks every open piece of work — assignments, exam prep, generic tasks —
// into a single ordered action list with a human-readable reason per item.
// Deliberately NOT a due-date sort: a 5-hour project due next week can
// outrank a 15-minute worksheet due tomorrow, because score includes the
// *required daily pace* to finish on time, grade weight, importance,
// difficulty (hard things reward early starts), and personal priority tiers.

import { daysUntil, fmtMinutes } from "@/lib/dates";
import type { RankedAction } from "@/lib/types";

export interface PriorityCandidate {
  id: string;
  entityType: RankedAction["entityType"];
  title: string;
  courseCode?: string;
  category?: string; // for tier alignment: ACADEMIC | STARTUP | CAREER | ...
  dueAt?: Date | null;
  estMinutes?: number | null;
  gradeWeight?: number | null; // percent of final grade
  importance?: number; // 1..5 (default 3)
  difficulty?: number; // 1..5 (default 3)
  status?: string; // NOT_STARTED | IN_PROGRESS | BLOCKED | ...
  dependenciesMet?: boolean; // default true
}

export interface PriorityContext {
  now?: Date;
  /** Categories in each personal priority tier (from Profile.tiersJson). */
  tier1?: string[];
  tier2?: string[];
}

interface Factor {
  points: number;
  label: string | null;
}

function urgencyPoints(days: number): Factor {
  if (days < 0) return { points: 45, label: "overdue" };
  if (days === 0) return { points: 40, label: "due today" };
  if (days === 1) return { points: 34, label: "due tomorrow" };
  if (days <= 2) return { points: 28, label: "due in 2 days" };
  if (days <= 3) return { points: 22, label: "due in 3 days" };
  if (days <= 5) return { points: 14, label: "due this week" };
  if (days <= 7) return { points: 8, label: "due within a week" };
  if (days <= 14) return { points: 3, label: null };
  return { points: 1, label: null };
}

export function scoreCandidate(
  c: PriorityCandidate,
  ctx: PriorityContext = {},
): RankedAction {
  const now = ctx.now ?? new Date();
  const factors: Factor[] = [];

  const days = c.dueAt ? daysUntil(c.dueAt, now) : null;
  if (days !== null) {
    factors.push(urgencyPoints(days));
  } else {
    factors.push({ points: 2, label: null }); // undated work still matters a little
  }

  // Pace pressure: minutes/day required to finish on time. This is what lets
  // big-but-later work outrank small-but-tomorrow work.
  if (c.estMinutes && days !== null && days >= 0) {
    const daysLeft = Math.max(1, days);
    const requiredDaily = c.estMinutes / daysLeft;
    const points = Math.min(30, requiredDaily / 6);
    if (points >= 8) {
      factors.push({
        points,
        label: `${fmtMinutes(c.estMinutes)} of work → needs ~${fmtMinutes(
          Math.round(requiredDaily),
        )}/day`,
      });
    } else {
      factors.push({ points, label: null });
    }
  }

  if (c.gradeWeight && c.gradeWeight > 0) {
    const points = Math.min(20, c.gradeWeight * 0.6);
    factors.push({
      points,
      label: c.gradeWeight >= 10 ? `${c.gradeWeight}% of grade` : null,
    });
  }

  const importance = c.importance ?? 3;
  factors.push({
    points: (importance - 3) * 4,
    label: importance >= 5 ? "high importance" : null,
  });

  const difficulty = c.difficulty ?? 3;
  factors.push({
    points: (difficulty - 3) * 2,
    label: difficulty >= 5 ? "historically difficult material" : null,
  });

  // Personal priority tiers (Profile): Tier-1 categories get a real bump.
  if (c.category) {
    if (ctx.tier1?.includes(c.category)) {
      factors.push({ points: 6, label: null });
    } else if (ctx.tier2?.includes(c.category)) {
      factors.push({ points: 3, label: null });
    }
  }

  if (c.status === "IN_PROGRESS") {
    factors.push({ points: 4, label: "already in progress — finish it" });
  }
  if (c.status === "BLOCKED") {
    factors.push({ points: -50, label: "blocked" });
  }
  if (c.dependenciesMet === false) {
    factors.push({ points: -30, label: "waiting on a prerequisite" });
  }

  const score = factors.reduce((s, f) => s + f.points, 0);
  const priority =
    score >= 55 ? "CRITICAL" : score >= 38 ? "HIGH" : score >= 22 ? "MEDIUM" : "LOW";

  const reasons = factors
    .filter((f) => f.label && f.points > 0)
    .sort((a, b) => b.points - a.points)
    .map((f) => f.label as string);
  const negatives = factors.filter((f) => f.label && f.points < 0);
  const reason =
    (reasons.length ? reasons.slice(0, 3).join(" + ") : "routine work") +
    (negatives.length ? ` (${negatives.map((f) => f.label).join(", ")})` : "");

  return {
    id: c.id,
    entityType: c.entityType,
    title: c.title,
    courseCode: c.courseCode,
    dueAt: c.dueAt ?? null,
    estMinutes: c.estMinutes ?? null,
    score: Math.round(score * 10) / 10,
    priority,
    reason,
  };
}

/** Rank all candidates, best first. */
export function rankActions(
  candidates: PriorityCandidate[],
  ctx: PriorityContext = {},
): RankedAction[] {
  return candidates
    .map((c) => scoreCandidate(c, ctx))
    .sort((a, b) => b.score - a.score);
}

/** The morning Top-N. Excludes blocked work from the headline list. */
export function topActions(
  candidates: PriorityCandidate[],
  n = 5,
  ctx: PriorityContext = {},
): RankedAction[] {
  return rankActions(candidates, ctx)
    .filter((a) => a.score > 0)
    .slice(0, n);
}
