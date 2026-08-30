// POST /api/assignments/[id]/plan — split the assignment's estimate into
// 30–90 minute WorkSession blocks on the least-loaded days before the due
// date, replacing any previously planned (uncompleted) blocks for it.

import { NextRequest, NextResponse } from "next/server";
import { endOfDay, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { planWorkSessions } from "@/lib/engine/scheduler";

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const assignment = await db.assignment.findUnique({ where: { id } });
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }
  if (!assignment.dueAt) {
    return NextResponse.json(
      { error: "Set a due date before planning sessions." },
      { status: 400 },
    );
  }
  if (!assignment.estMinutes) {
    return NextResponse.json(
      { error: "Set a time estimate before planning sessions." },
      { status: 400 },
    );
  }

  const now = new Date();

  // Existing planned load per day between today and the due date, excluding
  // this assignment's own blocks (they're about to be replaced).
  const sessions = await db.workSession.findMany({
    where: {
      completed: false,
      date: { gte: startOfDay(now), lte: endOfDay(assignment.dueAt) },
    },
  });
  const existingLoad = new Map<string, number>();
  for (const s of sessions) {
    if (s.assignmentId === id) continue;
    const key = dayKey(s.date);
    existingLoad.set(key, (existingLoad.get(key) ?? 0) + s.minutes);
  }

  const blocks = planWorkSessions({
    assignmentId: id,
    title: assignment.title,
    estMinutes: assignment.estMinutes,
    dueAt: assignment.dueAt,
    difficulty: assignment.difficulty,
    now,
    existingLoad,
  });
  if (blocks.length === 0) {
    return NextResponse.json(
      { error: "No plannable days remain before the due date." },
      { status: 400 },
    );
  }

  // Replace this assignment's previously planned (uncompleted) work blocks.
  await db.workSession.deleteMany({
    where: { assignmentId: id, kind: "ASSIGNMENT_WORK", completed: false },
  });
  await db.workSession.createMany({
    data: blocks.map((b) => ({
      date: startOfDay(b.date),
      minutes: b.minutes,
      kind: "ASSIGNMENT_WORK",
      focus: b.focus,
      rationale: b.rationale,
      assignmentId: id,
      courseId: assignment.courseId,
    })),
  });

  return NextResponse.json({ created: blocks.length });
}
