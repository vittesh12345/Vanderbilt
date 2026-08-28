// POST /api/topics — add a knowledge-tracker topic to a course.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const courseId = typeof body.courseId === "string" ? body.courseId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!courseId || !name) {
    return NextResponse.json(
      { error: "courseId and name are required" },
      { status: 400 },
    );
  }

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const topic = await db.topic.create({ data: { courseId, name } });
  return NextResponse.json(topic, { status: 201 });
}
