// POST /api/assignments — create an assignment. When no estimate is supplied,
// auto-estimate from kind × difficulty calibrated by TimeEstimateRecord
// history, and derive recommendedStartAt from the scheduler's lead time.

import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { estimateMinutes } from "@/lib/engine/estimate";
import { leadDays } from "@/lib/engine/scheduler";
import { ASSIGNMENT_KINDS, type AssignmentKind } from "@/lib/types";

function clampScale(value: unknown, fallback = 3): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function positiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
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

  const kind: AssignmentKind = ASSIGNMENT_KINDS.includes(body.kind)
    ? body.kind
    : "HOMEWORK";
  const difficulty = clampScale(body.difficulty);
  const importance = clampScale(body.importance);

  let dueAt: Date | null = null;
  if (typeof body.dueAt === "string" && body.dueAt) {
    dueAt = new Date(body.dueAt);
    if (isNaN(dueAt.getTime())) {
      return NextResponse.json({ error: "Invalid dueAt" }, { status: 400 });
    }
  }

  const gradeWeight =
    typeof body.gradeWeight === "number" &&
    Number.isFinite(body.gradeWeight) &&
    body.gradeWeight >= 0
      ? body.gradeWeight
      : null;

  let estMinutes = positiveInt(body.estMinutes);
  let estMinutesMax = positiveInt(body.estMinutesMax);

  // Auto-estimate when the user left the estimate blank.
  if (estMinutes == null) {
    const records = await db.timeEstimateRecord.findMany();
    const est = estimateMinutes(
      { kind, difficulty },
      records.map((r) => ({
        courseId: r.courseId,
        estimated: r.estimated,
        actual: r.actual,
      })),
      courseId,
    );
    estMinutes = est.minutes;
    estMinutesMax = est.minutesMax;
  }

  const recommendedStartAt =
    dueAt && estMinutes
      ? addDays(dueAt, -leadDays(estMinutes, difficulty))
      : null;

  const assignment = await db.assignment.create({
    data: {
      courseId,
      title,
      kind,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null,
      dueAt,
      difficulty,
      importance,
      gradeWeight,
      estMinutes,
      estMinutesMax,
      recommendedStartAt,
      notes:
        typeof body.notes === "string" && body.notes.trim()
          ? body.notes.trim()
          : null,
    },
  });

  return NextResponse.json(assignment, { status: 201 });
}
