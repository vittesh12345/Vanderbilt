// POST /api/tasks — create a generic non-course task (career, club, startup,
// research, personal, ...). Assignments stay in /api/assignments.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";
import { EVENT_CATEGORIES } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const category = EVENT_CATEGORIES.includes(body.category) ? body.category : "PERSONAL";

  // Bare YYYY-MM-DD from <input type="date"> is local end-of-day, not UTC
  // midnight (which would land on the previous local day).
  let dueAt: Date | null = null;
  if (typeof body.dueAt === "string" && body.dueAt) {
    dueAt = parseDateInput(body.dueAt, "23:59");
    if (!dueAt) {
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
