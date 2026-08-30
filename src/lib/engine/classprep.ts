// Before-class preparation + the 5-minute pre-class brief.
//
// For each course's next meeting: what to read/complete beforehand (derived
// from open READING/other assignments due by that meeting), what to re-review
// (topics flagged NEEDS_REVIEW), and a short generated brief.

import { addDays, startOfDay } from "date-fns";
import { fmtMinutes, parseHM } from "@/lib/dates";
import type { ClassPrep, ClassPrepItem } from "@/lib/types";

export interface ClassPrepInput {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  now?: Date;
  meetings: { dayOfWeek: number; startTime: string; endTime: string; kind: string }[];
  openAssignments: {
    id: string;
    title: string;
    kind: string;
    dueAt: Date | null;
    estMinutes: number | null;
    status: string;
  }[];
  topics: { name: string; mastery: string; confusions: string[] }[];
}

/** Next occurrence of any weekly meeting strictly after `now`. */
export function nextMeeting(
  meetings: ClassPrepInput["meetings"],
  now: Date,
): { start: Date; kind: string } | null {
  let best: { start: Date; kind: string } | null = null;
  for (const m of meetings) {
    const startMins = parseHM(m.startTime);
    if (startMins == null) continue;
    for (let i = 0; i < 8; i++) {
      const day = startOfDay(addDays(now, i));
      if (day.getDay() !== m.dayOfWeek) continue;
      const start = new Date(day);
      start.setMinutes(startMins);
      if (start <= now) continue;
      if (!best || start < best.start) best = { start, kind: m.kind };
      break;
    }
  }
  return best;
}

export function buildClassPrep(input: ClassPrepInput): ClassPrep | null {
  const now = input.now ?? new Date();
  const meeting = nextMeeting(input.meetings, now);
  if (!meeting) return null;

  const dueCutoff = addDays(meeting.start, 1);
  const items: ClassPrepItem[] = [];

  for (const a of input.openAssignments) {
    if (!a.dueAt || a.dueAt > dueCutoff) continue;
    if (a.kind === "READING") {
      items.push({
        label: a.title,
        estMinutes: a.estMinutes ?? undefined,
        kind: "READING",
        sourceId: a.id,
      });
    } else {
      items.push({
        label: `Complete: ${a.title}`,
        estMinutes: a.estMinutes ?? undefined,
        kind: "ASSIGNMENT",
        sourceId: a.id,
      });
    }
  }

  const weak = input.topics.filter((t) => t.mastery === "NEEDS_REVIEW");
  for (const t of weak.slice(0, 2)) {
    items.push({
      label: `Spend ~20 min reviewing ${t.name}`,
      estMinutes: 20,
      kind: "REVIEW",
    });
  }

  const totalMinutes = items.reduce((s, i) => s + (i.estMinutes ?? 30), 0);

  // The 5-minute pre-class brief.
  const recent = input.topics.slice(-3).map((t) => t.name);
  const mastered = input.topics
    .filter((t) => t.mastery === "MASTERED" || t.mastery === "PRACTICED")
    .slice(-2)
    .map((t) => t.name);
  const confusions = input.topics.flatMap((t) =>
    t.confusions.slice(0, 1).map((c) => ({ topic: t.name, q: c })),
  );

  const briefParts: string[] = [];
  briefParts.push(
    recent.length
      ? `This ${meeting.kind.toLowerCase()} builds on ${recent.join(", ")}.`
      : `First sessions set the foundation — skim the syllabus objectives before ${input.courseCode}.`,
  );
  if (mastered.length)
    briefParts.push(`You should already be solid on ${mastered.join(" and ")}.`);
  if (weak.length)
    briefParts.push(
      `Pay particular attention to ${weak.map((t) => t.name).join(", ")} — flagged as needing review.`,
    );
  if (confusions.length)
    briefParts.push(
      `Consider asking about: "${confusions[0].q}" (${confusions[0].topic}).`,
    );
  if (items.length)
    briefParts.push(
      `Total prep: ~${fmtMinutes(totalMinutes)} across ${items.length} item${items.length === 1 ? "" : "s"}.`,
    );

  return {
    courseId: input.courseId,
    courseCode: input.courseCode,
    meetingStart: meeting.start,
    items,
    totalMinutes,
    brief: briefParts.join(" "),
  };
}
