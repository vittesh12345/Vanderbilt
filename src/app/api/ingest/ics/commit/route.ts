// POST /api/ingest/ics/commit — Brightspace feed intake, step 2.
// Creates Assignments/Exams (course-matched) or CalendarEvents from the
// reviewed candidates. Dedupes by normalized title + same calendar day.

import { NextRequest, NextResponse } from "next/server";
import { isSameDay } from "date-fns";
import { db } from "@/lib/db";
import { estimateMinutes } from "@/lib/engine/estimate";
import type { AssignmentKind } from "@/lib/types";

interface IncomingItem {
  title: string;
  kind: "ASSIGNMENT" | "EXAM" | "QUIZ" | "EVENT";
  at: string;
  courseId?: string | null;
  location?: string;
  url?: string;
}

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const items: IncomingItem[] = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return NextResponse.json({ error: "No items selected" }, { status: 400 });
  }

  const [assignments, exams, events, records] = await Promise.all([
    db.assignment.findMany({ select: { title: true, dueAt: true, courseId: true } }),
    db.exam.findMany({ select: { title: true, startAt: true, courseId: true } }),
    db.calendarEvent.findMany({ select: { title: true, startAt: true, courseId: true } }),
    db.timeEstimateRecord.findMany(),
  ]);
  // Dedupe is course-scoped: "Quiz 1" in CS and "Quiz 1" in MATH on the same
  // day are different items.
  const pool = [
    ...assignments
      .filter((a) => a.dueAt)
      .map((a) => ({ title: normTitle(a.title), at: a.dueAt as Date, courseId: a.courseId as string | null })),
    ...exams.map((e) => ({ title: normTitle(e.title), at: e.startAt, courseId: e.courseId as string | null })),
    ...events.map((e) => ({ title: normTitle(e.title), at: e.startAt, courseId: e.courseId })),
  ];
  const estRecords = records.map((r) => ({
    courseId: r.courseId,
    estimated: r.estimated,
    actual: r.actual,
  }));

  let createdAssignments = 0;
  let createdExams = 0;
  let createdEvents = 0;
  let skipped = 0;

  for (const item of items) {
    const title = typeof item.title === "string" ? item.title.trim().slice(0, 200) : "";
    const at = new Date(item.at);
    if (!title || isNaN(at.getTime())) {
      skipped++;
      continue;
    }
    const nt = normTitle(title);
    const itemCourse = item.courseId ?? null;
    if (
      pool.some(
        (p) => p.title === nt && isSameDay(p.at, at) && p.courseId === itemCourse,
      )
    ) {
      skipped++;
      continue;
    }
    pool.push({ title: nt, at, courseId: itemCourse });

    const course = item.courseId
      ? await db.course.findUnique({ where: { id: item.courseId } })
      : null;

    if ((item.kind === "EXAM" || item.kind === "QUIZ") && course) {
      await db.exam.create({
        data: {
          courseId: course.id,
          title,
          kind:
            item.kind === "QUIZ"
              ? "QUIZ"
              : /final/i.test(title)
                ? "FINAL"
                : "MIDTERM",
          startAt: at,
          location: item.location?.slice(0, 200) ?? null,
          source: "BRIGHTSPACE",
        },
      });
      createdExams++;
    } else if (item.kind === "ASSIGNMENT" && course) {
      const kind: AssignmentKind = /read|chapter/i.test(title)
        ? "READING"
        : /lab\b/i.test(title)
          ? "LAB"
          : /project/i.test(title)
            ? "PROJECT"
            : "HOMEWORK";
      const est = estimateMinutes(
        { kind, difficulty: course.difficulty },
        estRecords,
        course.id,
      );
      await db.assignment.create({
        data: {
          courseId: course.id,
          title,
          kind,
          dueAt: at,
          source: "BRIGHTSPACE",
          sourceUrl: item.url?.slice(0, 500) ?? null,
          estMinutes: est.minutes,
          estMinutesMax: est.minutesMax,
        },
      });
      createdAssignments++;
    } else {
      await db.calendarEvent.create({
        data: {
          title,
          category: "ACADEMIC",
          startAt: at,
          location: item.location?.slice(0, 200) ?? null,
          url: item.url?.slice(0, 500) ?? null,
          source: "OTHER",
          sourceUrl: item.url?.slice(0, 500) ?? null,
          courseId: course?.id ?? null,
        },
      });
      createdEvents++;
    }
  }

  return NextResponse.json({
    createdAssignments,
    createdExams,
    createdEvents,
    skipped,
  });
}
