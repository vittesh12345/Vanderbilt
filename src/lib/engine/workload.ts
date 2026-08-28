// Academic workload forecast + deadline-cluster detection.
//
// Produces the NEXT-14-DAYS heat strip (LIGHT → EXTREME per day) and flags
// HEAVY WEEK windows where deadlines cluster, with concrete start-early
// recommendations.

import { addDays, isSameDay, startOfDay } from "date-fns";
import type { DayLoad, HeavyWeek, LoadLevel } from "@/lib/types";

export interface WorkloadInputs {
  now?: Date;
  horizonDays?: number; // default 14
  /** Weekly class meetings: dayOfWeek 0-6 + duration minutes. */
  classMeetings: { dayOfWeek: number; minutes: number; label: string }[];
  /** Open assignments with due dates. */
  assignments: {
    id: string;
    title: string;
    courseCode: string;
    dueAt: Date;
    estMinutes?: number | null;
    kind?: string;
  }[];
  exams: { id: string; title: string; courseCode: string; startAt: Date; kind: string }[];
  /** Planned work sessions (study/assignment blocks). */
  sessions: { date: Date; minutes: number }[];
  /** Non-academic deadlines that still load a day (applications etc.). */
  otherDeadlines?: { title: string; at: Date }[];
}

function levelFor(minutes: number, examCount: number): LoadLevel {
  let level: LoadLevel;
  if (minutes < 90) level = "LIGHT";
  else if (minutes < 180) level = "NORMAL";
  else if (minutes < 300) level = "HIGH";
  else if (minutes < 420) level = "VERY_HIGH";
  else level = "EXTREME";
  // An exam day is never below HIGH regardless of planned minutes.
  if (examCount > 0 && (level === "LIGHT" || level === "NORMAL")) level = "HIGH";
  return level;
}

export function forecastWorkload(inputs: WorkloadInputs): DayLoad[] {
  const now = inputs.now ?? new Date();
  const horizon = inputs.horizonDays ?? 14;
  const days: DayLoad[] = [];

  for (let i = 0; i < horizon; i++) {
    const date = startOfDay(addDays(now, i));
    const dow = date.getDay();

    const classMinutes = inputs.classMeetings
      .filter((m) => m.dayOfWeek === dow)
      .reduce((s, m) => s + m.minutes, 0);

    const dueToday = inputs.assignments.filter((a) => isSameDay(a.dueAt, date));
    const examsToday = inputs.exams.filter((e) => isSameDay(e.startAt, date));
    const sessionMinutes = inputs.sessions
      .filter((s) => isSameDay(s.date, date))
      .reduce((s, x) => s + x.minutes, 0);
    const otherToday = (inputs.otherDeadlines ?? []).filter((o) =>
      isSameDay(o.at, date),
    );

    // Deadline-day pressure: work due that day weighs in even if unscheduled.
    const dueMinutes = dueToday.reduce((s, a) => s + (a.estMinutes ?? 60) * 0.6, 0);
    const minutes = Math.round(
      classMinutes * 0.5 + sessionMinutes + dueMinutes + examsToday.length * 120 +
        otherToday.length * 45,
    );

    const notes: string[] = [
      ...examsToday.map((e) => `${e.kind === "QUIZ" ? "Quiz" : "Exam"}: ${e.courseCode} ${e.title}`),
      ...dueToday.map((a) => `${a.courseCode}: ${a.title} due`),
      ...otherToday.map((o) => `${o.title}`),
    ];

    days.push({
      date,
      level: levelFor(minutes, examsToday.length),
      minutes,
      classMinutes,
      dueCount: dueToday.length,
      examCount: examsToday.length,
      notes,
    });
  }
  return days;
}

/**
 * Sliding 7-day windows over the horizon; a window is HEAVY when deadlines
 * cluster. Overlapping heavy windows are merged. Each heavy week carries
 * concrete recommendations ("Start X review 7 days early").
 */
export function detectHeavyWeeks(inputs: WorkloadInputs): HeavyWeek[] {
  const now = startOfDay(inputs.now ?? new Date());
  const horizon = inputs.horizonDays ?? 28;
  const windows: HeavyWeek[] = [];

  for (let start = 0; start <= horizon - 7; start++) {
    const s = addDays(now, start);
    const e = addDays(s, 6);
    const inWindow = (d: Date) => d >= s && d <= addDays(e, 1);

    const assignments = inputs.assignments.filter((a) => inWindow(a.dueAt));
    const exams = inputs.exams.filter(
      (x) => x.kind !== "QUIZ" && inWindow(x.startAt),
    );
    const quizzes = inputs.exams.filter(
      (x) => x.kind === "QUIZ" && inWindow(x.startAt),
    );
    const applications = (inputs.otherDeadlines ?? []).filter((o) =>
      inWindow(o.at),
    );

    const heavy =
      exams.length >= 2 ||
      (exams.length >= 1 && assignments.length >= 3) ||
      assignments.length + exams.length + quizzes.length + applications.length >= 6;

    if (!heavy) continue;

    const recommendations: string[] = [];
    for (const exam of exams) {
      recommendations.push(
        `Start ${exam.courseCode} review ${exam.kind === "FINAL" ? 10 : 7} days early.`,
      );
    }
    for (const a of assignments) {
      if ((a.estMinutes ?? 0) >= 180) {
        recommendations.push(
          `Start "${a.title}" ${Math.max(3, Math.ceil((a.estMinutes ?? 180) / 60))} days early.`,
        );
      }
    }
    if (applications.length) {
      recommendations.push(
        `Draft application materials the weekend before (${applications.length} due).`,
      );
    }

    windows.push({
      start: s,
      end: e,
      assignments: assignments.length,
      quizzes: quizzes.length,
      exams: exams.length,
      applications: applications.length,
      recommendations: [...new Set(recommendations)],
    });
  }

  // Merge overlapping windows, keeping the max counts and union of recs.
  const merged: HeavyWeek[] = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) {
      last.end = w.end > last.end ? w.end : last.end;
      last.assignments = Math.max(last.assignments, w.assignments);
      last.quizzes = Math.max(last.quizzes, w.quizzes);
      last.exams = Math.max(last.exams, w.exams);
      last.applications = Math.max(last.applications, w.applications);
      last.recommendations = [
        ...new Set([...last.recommendations, ...w.recommendations]),
      ];
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}
