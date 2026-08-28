// POST /api/events — create a CalendarEvent (manual calendar entry).
// Derived entries (classes, exams, due dates, sessions) are merged at query
// time by getUnifiedCalendar — only genuine standalone events live here.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { EVENT_CATEGORIES, type EventCategory } from "@/lib/types";

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const category: EventCategory = EVENT_CATEGORIES.includes(body.category)
    ? body.category
    : "PERSONAL";

  if (typeof body.startAt !== "string" || !body.startAt) {
    return NextResponse.json({ error: "startAt is required" }, { status: 400 });
  }
  const startAt = new Date(body.startAt);
  if (isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
  }

  let endAt: Date | null = null;
  if (typeof body.endAt === "string" && body.endAt) {
    endAt = new Date(body.endAt);
    if (isNaN(endAt.getTime())) {
      return NextResponse.json({ error: "Invalid endAt" }, { status: 400 });
    }
    if (endAt < startAt) {
      return NextResponse.json(
        { error: "endAt must be after startAt" },
        { status: 400 },
      );
    }
  }

  let courseId: string | null = null;
  if (typeof body.courseId === "string" && body.courseId) {
    const course = await db.course.findUnique({ where: { id: body.courseId } });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 400 });
    }
    courseId = course.id;
  }

  const event = await db.calendarEvent.create({
    data: {
      title,
      category,
      startAt,
      endAt,
      location: optionalText(body.location),
      description: optionalText(body.description),
      url: optionalText(body.url),
      source: optionalText(body.source) ?? "MANUAL",
      sourceUrl: optionalText(body.sourceUrl),
      courseId,
    },
  });

  return NextResponse.json(event, { status: 201 });
}
