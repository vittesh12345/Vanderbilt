// PATCH /api/events/[id] — whitelisted updates to a CalendarEvent.
// DELETE — removes the event.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { EVENT_CATEGORIES } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const existing = await db.calendarEvent.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const data: {
    title?: string;
    category?: string;
    startAt?: Date;
    endAt?: Date | null;
    location?: string | null;
    description?: string | null;
    url?: string | null;
    source?: string;
    sourceUrl?: string | null;
    courseId?: string | null;
  } = {};

  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }
  if (
    typeof body.category === "string" &&
    EVENT_CATEGORIES.includes(body.category as never)
  ) {
    data.category = body.category;
  }

  if (typeof body.startAt === "string" && body.startAt) {
    const d = new Date(body.startAt);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
    }
    data.startAt = d;
  }
  if (typeof body.endAt === "string" && body.endAt) {
    const d = new Date(body.endAt);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid endAt" }, { status: 400 });
    }
    data.endAt = d;
  } else if (body.endAt === null) {
    data.endAt = null;
  }
  const effectiveStart = data.startAt ?? existing.startAt;
  const effectiveEnd = data.endAt === undefined ? existing.endAt : data.endAt;
  if (effectiveEnd && effectiveEnd < effectiveStart) {
    return NextResponse.json(
      { error: "endAt must be after startAt" },
      { status: 400 },
    );
  }

  for (const field of ["location", "description", "url", "sourceUrl"] as const) {
    const value = body[field];
    if (typeof value === "string") {
      data[field] = value.trim() || null;
    } else if (value === null) {
      data[field] = null;
    }
  }

  if (typeof body.source === "string" && body.source.trim()) {
    data.source = body.source.trim();
  }

  if (typeof body.courseId === "string" && body.courseId) {
    const course = await db.course.findUnique({ where: { id: body.courseId } });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 400 });
    }
    data.courseId = course.id;
  } else if (body.courseId === null) {
    data.courseId = null;
  }

  const event = await db.calendarEvent.update({ where: { id }, data });
  return NextResponse.json(event);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.calendarEvent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
}
