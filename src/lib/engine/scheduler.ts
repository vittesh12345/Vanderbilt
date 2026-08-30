// Work-session scheduler for assignments.
//
// Splits an assignment's estimated time into 30–90 minute blocks placed on the
// least-loaded days between the recommended start and the due date, so the
// Today view can say "Tuesday 45 min, Wednesday 60 min, Thursday 30 min"
// instead of "it's due Thursday".

import { addDays, isSameDay, startOfDay } from "date-fns";
import { daysUntil } from "@/lib/dates";

export interface ScheduleInput {
  assignmentId: string;
  title: string;
  estMinutes: number;
  dueAt: Date;
  difficulty?: number; // 1..5 — harder work gets more lead time
  now?: Date;
  /** Existing planned minutes per day (ISO yyyy-mm-dd → minutes) to balance against. */
  existingLoad?: Map<string, number>;
  /** Per-day ceiling for new sessions (default 120). */
  dailyCapMinutes?: number;
}

export interface PlannedBlock {
  date: Date;
  minutes: number;
  focus: string;
  rationale: string;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** How many days before the deadline work should begin. */
export function leadDays(estMinutes: number, difficulty = 3): number {
  const byVolume = Math.ceil(estMinutes / 75); // ~75 productive min/day/course
  const buffer = difficulty >= 4 ? 1 : 0;
  return Math.max(1, byVolume + buffer);
}

export function planWorkSessions(input: ScheduleInput): PlannedBlock[] {
  const now = input.now ?? new Date();
  const cap = input.dailyCapMinutes ?? 120;
  const today = startOfDay(now);
  const dueDay = startOfDay(input.dueAt);
  const daysAvailable = daysUntil(input.dueAt, now);

  if (daysAvailable < 0 || input.estMinutes <= 0) return [];

  // Candidate days: from max(today, due - lead) through the due day.
  const lead = Math.min(leadDays(input.estMinutes, input.difficulty), daysAvailable);
  const firstDay = addDays(dueDay, -lead);
  const start = firstDay > today ? firstDay : today;

  const candidates: Date[] = [];
  for (let d = start; d <= dueDay; d = addDays(d, 1)) candidates.push(d);
  if (candidates.length === 0) candidates.push(today);

  // Chunk the estimate into 30–90 minute blocks (prefer ~60).
  let remaining = input.estMinutes;
  const blocks: number[] = [];
  while (remaining > 0) {
    if (remaining <= 90) {
      blocks.push(Math.max(20, remaining));
      remaining = 0;
    } else {
      blocks.push(60);
      remaining -= 60;
    }
  }

  // Place blocks on the least-loaded candidate days (stable preference for
  // earlier days on ties, but keep the final short block near the deadline
  // for submission/polish).
  const load = new Map<string, number>(input.existingLoad ?? []);
  const placed: PlannedBlock[] = [];
  const total = blocks.length;

  blocks.forEach((minutes, i) => {
    const isLast = i === total - 1 && total > 1;
    const pool = isLast
      ? candidates.slice(-Math.min(2, candidates.length)) // finish near the deadline
      : candidates;
    let best: Date = pool[0];
    let bestLoad = Infinity;
    for (const day of pool) {
      const l = load.get(dayKey(day)) ?? 0;
      if (l + minutes > cap && pool.length > 1) continue;
      if (l < bestLoad) {
        bestLoad = l;
        best = day;
      }
    }
    load.set(dayKey(best), (load.get(dayKey(best)) ?? 0) + minutes);
    placed.push({
      date: best,
      minutes,
      focus:
        total === 1
          ? `Work on ${input.title}`
          : isLast
            ? `Finish + submit ${input.title}`
            : `Work on ${input.title} (part ${i + 1}/${total})`,
      rationale: isSameDay(best, dueDay)
        ? "Final block reserved for polish and submission."
        : "Placed on a lighter day before the deadline.",
    });
  });

  return placed.sort((a, b) => a.date.getTime() - b.date.getTime());
}
