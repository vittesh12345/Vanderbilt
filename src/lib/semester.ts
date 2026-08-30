// Semester naming and default term windows.
//
// Term boundaries matter beyond bookkeeping: the calendar only expands weekly
// class meetings inside the active semester, so a wrong window shows phantom
// classes over winter break. The dates below are conventional Vanderbilt term
// lengths used as a starting point — every caller that relies on them should
// tell the student they are estimates to confirm on the settings page.

import { addDays } from "date-fns";
import { db } from "@/lib/db";

export function semesterNameFor(d: Date): string {
  const m = d.getMonth();
  const term = m <= 4 ? "Spring" : m <= 6 ? "Summer" : "Fall";
  return `${term} ${d.getFullYear()}`;
}

interface TermWindow {
  startDate: Date;
  endDate: Date;
  /** True when the dates are conventional defaults, not sourced. */
  estimated: boolean;
}

/** "Fall 2026" -> that term's conventional start/end dates. */
export function termWindowFor(name: string, now: Date = new Date()): TermWindow {
  const m = name.match(/\b(fall|spring|summer|winter|maymester)\b/i);
  const yearMatch = name.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : now.getFullYear();
  const term = m ? m[1].toLowerCase() : null;

  // Month is 0-indexed; day-of-month is the conventional first/last class day.
  const spans: Record<string, [number, number, number, number]> = {
    fall: [7, 20, 11, 15], // Aug 20 – Dec 15
    spring: [0, 8, 3, 30], // Jan 8 – Apr 30
    summer: [4, 15, 7, 5], // May 15 – Aug 5
    maymester: [4, 5, 4, 30], // May 5 – May 30
    winter: [0, 2, 0, 20], // Jan 2 – Jan 20
  };
  const span = term ? spans[term] : undefined;
  if (!span) {
    return {
      startDate: addDays(now, -30),
      endDate: addDays(now, 120),
      estimated: true,
    };
  }
  const [sm, sd, em, ed] = span;
  return {
    startDate: new Date(year, sm, sd),
    endDate: new Date(year, em, ed, 23, 59, 59),
    estimated: true,
  };
}

/** The semester marked current, else the most recent, else a fresh one. */
export async function findOrCreateCurrentSemester() {
  const current =
    (await db.semester.findFirst({ where: { isCurrent: true } })) ??
    (await db.semester.findFirst({ orderBy: { startDate: "desc" } }));
  if (current) return current;
  const now = new Date();
  const name = semesterNameFor(now);
  const { startDate, endDate } = termWindowFor(name, now);
  return db.semester.create({
    data: { name, startDate, endDate, isCurrent: true },
  });
}

/**
 * Finds the semester with this name or creates it, making it the only current
 * one. Used when a pasted schedule is for a different term than the one on
 * file — a new term is a new semester, not an overwrite of the old.
 */
export async function findOrCreateSemesterNamed(name: string) {
  const trimmed = name.trim().slice(0, 60);
  const existing = await db.semester.findFirst({ where: { name: trimmed } });
  if (existing) {
    if (!existing.isCurrent) {
      await db.semester.updateMany({ data: { isCurrent: false }, where: {} });
      return db.semester.update({
        where: { id: existing.id },
        data: { isCurrent: true },
      });
    }
    return existing;
  }
  const { startDate, endDate } = termWindowFor(trimmed);
  await db.semester.updateMany({ data: { isCurrent: false }, where: {} });
  return db.semester.create({
    data: { name: trimmed, startDate, endDate, isCurrent: true },
  });
}
