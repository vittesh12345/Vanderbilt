// PATCH /api/exams/[id] — whitelisted updates (topics array → topicsJson).
// DELETE — removes the exam; its WorkSessions cascade.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { EXAM_KINDS } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const existing = await db.exam.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const data: {
    courseId?: string;
    title?: string;
    kind?: string;
    startAt?: Date;
    endAt?: Date | null;
    location?: string | null;
    weight?: number | null;
    topicsJson?: string;
    notes?: string | null;
  } = {};

  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }
  if (typeof body.kind === "string" && EXAM_KINDS.includes(body.kind as never)) {
    data.kind = body.kind;
  }
  if (typeof body.courseId === "string" && body.courseId !== existing.courseId) {
    const course = await db.course.findUnique({ where: { id: body.courseId } });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 400 });
    }
    data.courseId = body.courseId;
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

  if (typeof body.location === "string") {
    data.location = body.location.trim() || null;
  } else if (body.location === null) {
    data.location = null;
  }

  if (typeof body.weight === "number" && Number.isFinite(body.weight) && body.weight >= 0) {
    data.weight = body.weight;
  } else if (body.weight === null) {
    data.weight = null;
  }

  if (Array.isArray(body.topics)) {
    const topics = body.topics
      .filter((t: unknown): t is string => typeof t === "string")
      .map((t: string) => t.trim())
      .filter(Boolean);
    data.topicsJson = toJson(topics);
  }

  if (typeof body.notes === "string") {
    data.notes = body.notes.trim() || null;
  } else if (body.notes === null) {
    data.notes = null;
  }

  // A moved exam invalidates its study plan: drop the stale (uncompleted)
  // sessions and clear planGeneratedAt so the UNPLANNED_EXAM alert prompts a
  // regenerate — otherwise prep sessions dated after the new exam linger.
  const dateChanged =
    data.startAt !== undefined &&
    data.startAt.getTime() !== existing.startAt.getTime();
  if (dateChanged) {
    await db.workSession.deleteMany({
      where: { examId: id, kind: "EXAM_STUDY", completed: false },
    });
  }

  const exam = await db.exam.update({
    where: { id },
    data: dateChanged
      ? { ...data, planGeneratedAt: null, planRationale: null }
      : data,
  });

  // Sessions carry a denormalized courseId — keep it in sync on reassignment.
  if (data.courseId) {
    await db.workSession.updateMany({
      where: { examId: id },
      data: { courseId: data.courseId },
    });
  }

  return NextResponse.json(exam);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.exam.delete({ where: { id } }); // WorkSessions cascade
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }
}
