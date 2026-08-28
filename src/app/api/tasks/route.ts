// POST /api/tasks — create a generic non-course task (career, club, startup,
// research, personal, ...). Assignments stay in /api/assignments.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { EVENT_CATEGORIES } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const category = EVENT_CATEGORIES.includes(body.category) ? body.category : "PERSONAL";

  let dueAt: Date | null = null;
  if (typeof body.dueAt === "string" && body.dueAt) {
    dueAt = new Date(body.dueAt);
    if (isNaN(dueAt.getTime())) {
      return NextResponse.json({ error: "Invalid dueAt" }, { status: 400 });
    }
  }

  const estMinutes =
    typeof body.estMinutes === "number" &&
    Number.isFinite(body.estMinutes) &&
    body.estMinutes > 0
      ? Math.round(body.estMinutes)
      : null;

  const importance =
    typeof body.importance === "number" && Number.isFinite(body.importance)
      ? Math.min(5, Math.max(1, Math.round(body.importance)))
      : 3;

  const task = await db.task.create({
    data: {
      title,
      category,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null,
      dueAt,
      estMinutes,
      importance,
      goalId:
        typeof body.goalId === "string" && body.goalId ? body.goalId : null,
    },
  });

  return NextResponse.json(task, { status: 201 });
}
