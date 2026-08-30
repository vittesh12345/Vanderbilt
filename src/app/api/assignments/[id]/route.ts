// PATCH /api/assignments/[id] — whitelisted updates with status-transition
// handling: entering COMPLETED/SUBMITTED stamps completedAt (and, with
// actualMinutes, records a TimeEstimateRecord for calibration); leaving those
// statuses clears completedAt.
// DELETE — removes the assignment; its WorkSessions cascade.

import { NextRequest, NextResponse } from "next/server";
import { addDays, isSameDay } from "date-fns";
import { db } from "@/lib/db";
import { estimateMinutes } from "@/lib/engine/estimate";
import { leadDays } from "@/lib/engine/scheduler";
import {
  ASSIGNMENT_KINDS,
  ASSIGNMENT_STATUSES,
  type AssignmentKind,
} from "@/lib/types";

const DONE = ["COMPLETED", "SUBMITTED"];

function clampScale(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const existing = await db.assignment.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  const data: {
    courseId?: string;
    title?: string;
    kind?: string;
    description?: string | null;
    dueAt?: Date | null;
    status?: string;
    difficulty?: number;
    importance?: number;
    gradeWeight?: number | null;
    estMinutes?: number | null;
    estMinutesMax?: number | null;
    actualMinutes?: number;
    notes?: string | null;
    completedAt?: Date | null;
    recommendedStartAt?: Date | null;
  } = {};

  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }
  if (typeof body.kind === "string" && ASSIGNMENT_KINDS.includes(body.kind as never)) {
    data.kind = body.kind;
  }
  if (typeof body.courseId === "string" && body.courseId !== existing.courseId) {
    const course = await db.course.findUnique({ where: { id: body.courseId } });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 400 });
    }
    data.courseId = body.courseId;
  }
  if (typeof body.description === "string") data.description = body.description;
  else if (body.description === null) data.description = null;
  if (typeof body.notes === "string") data.notes = body.notes;
  else if (body.notes === null) data.notes = null;

  if (typeof body.dueAt === "string" && body.dueAt) {
    const d = new Date(body.dueAt);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid dueAt" }, { status: 400 });
    }
    data.dueAt = d;
  } else if (body.dueAt === null) {
    data.dueAt = null;
  }

  if (typeof body.difficulty === "number" && Number.isFinite(body.difficulty)) {
    data.difficulty = clampScale(body.difficulty);
  }
  if (typeof body.importance === "number" && Number.isFinite(body.importance)) {
    data.importance = clampScale(body.importance);
  }
  if (typeof body.gradeWeight === "number" && body.gradeWeight >= 0) {
    data.gradeWeight = body.gradeWeight;
  } else if (body.gradeWeight === null) {
    data.gradeWeight = null;
  }
  if (typeof body.estMinutes === "number" && body.estMinutes > 0) {
    data.estMinutes = Math.round(body.estMinutes);
  } else if (body.estMinutes === null) {
    // The form promises "leave blank to auto-estimate" — honor it on edit
    // exactly like POST does, instead of clearing the estimate.
    const records = await db.timeEstimateRecord.findMany();
    const est = estimateMinutes(
      {
        kind: (data.kind ?? existing.kind) as AssignmentKind,
        difficulty: data.difficulty ?? existing.difficulty,
      },
      records.map((r) => ({
        courseId: r.courseId,
        estimated: r.estimated,
        actual: r.actual,
      })),
      existing.courseId,
    );
    data.estMinutes = est.minutes;
    data.estMinutesMax = est.minutesMax;
  }
  if (typeof body.estMinutesMax === "number" && body.estMinutesMax > 0) {
    data.estMinutesMax = Math.round(body.estMinutesMax);
  } else if (body.estMinutesMax === null) {
    data.estMinutesMax = null;
  }

  // ---- Status transitions -------------------------------------------------
  const wasDone = DONE.includes(existing.status);
  let isDone = wasDone;
  if (typeof body.status === "string") {
    if (!ASSIGNMENT_STATUSES.includes(body.status as never)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
    isDone = DONE.includes(body.status);
    if (isDone && !wasDone) data.completedAt = new Date();
    if (!isDone && wasDone) data.completedAt = null;
  }

  // Actual minutes recorded → store + feed estimate calibration. A calibration
  // record needs a REAL prior estimate (never fabricate estimated=actual) and
  // is written once, on the transition into a done status.
  if (typeof body.actualMinutes === "number" && body.actualMinutes > 0) {
    const actual = Math.round(body.actualMinutes);
    data.actualMinutes = actual;
    const estimated = data.estMinutes ?? existing.estMinutes;
    if (estimated != null && isDone && !wasDone) {
      await db.timeEstimateRecord.create({
        data: {
          entityType: "ASSIGNMENT",
          entityId: id,
          courseId: existing.courseId,
          kind: existing.kind,
          estimated,
          actual,
        },
      });
    }
  }

  // Keep the recommended start date consistent when its inputs change.
  if (
    data.dueAt !== undefined ||
    data.estMinutes !== undefined ||
    data.difficulty !== undefined
  ) {
    const nextDue = data.dueAt !== undefined ? data.dueAt : existing.dueAt;
    const nextEst =
      data.estMinutes !== undefined ? data.estMinutes : existing.estMinutes;
    const nextDifficulty = data.difficulty ?? existing.difficulty;
    data.recommendedStartAt =
      nextDue && nextEst
        ? addDays(nextDue, -leadDays(nextEst, nextDifficulty))
        : null;
  }

  // A moved due date invalidates planned work sessions (they were scheduled
  // against the old deadline) — drop the uncompleted ones so the user replans.
  const dueDayChanged =
    data.dueAt !== undefined &&
    !(data.dueAt === null && existing.dueAt === null) &&
    (data.dueAt === null ||
      existing.dueAt === null ||
      !isSameDay(data.dueAt, existing.dueAt));
  if (dueDayChanged) {
    await db.workSession.deleteMany({
      where: { assignmentId: id, kind: "ASSIGNMENT_WORK", completed: false },
    });
  }

  const assignment = await db.assignment.update({ where: { id }, data });

  // Sessions carry a denormalized courseId — keep it in sync on reassignment.
  if (data.courseId) {
    await db.workSession.updateMany({
      where: { assignmentId: id },
      data: { courseId: data.courseId },
    });
  }

  return NextResponse.json(assignment);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.assignment.delete({ where: { id } }); // WorkSessions cascade
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }
}
