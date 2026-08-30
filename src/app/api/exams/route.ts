// POST /api/exams — create an exam. `topics` arrives as a string[] and is
// stored serialized in topicsJson.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { EXAM_KINDS, type ExamKind } from "@/lib/types";

function cleanTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const courseId = typeof body.courseId === "string" ? body.courseId : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!courseId || !title) {
    return NextResponse.json(
      { error: "courseId and title are required" },
      { status: 400 },
    );
  }
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 400 });
  }

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
  }

  const kind: ExamKind = EXAM_KINDS.includes(body.kind) ? body.kind : "MIDTERM";
  const weight =
    typeof body.weight === "number" &&
    Number.isFinite(body.weight) &&
    body.weight >= 0
      ? body.weight
      : null;

  const exam = await db.exam.create({
    data: {
      courseId,
      title,
      kind,
      startAt,
      endAt,
      location:
        typeof body.location === "string" && body.location.trim()
          ? body.location.trim()
          : null,
      weight,
      topicsJson: toJson(cleanTopics(body.topics)),
      notes:
        typeof body.notes === "string" && body.notes.trim()
          ? body.notes.trim()
          : null,
    },
  });

  return NextResponse.json(exam, { status: 201 });
}
