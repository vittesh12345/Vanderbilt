// PATCH /api/tasks/[id] — update task fields + status (COMPLETED stamps
// completedAt; any other status clears it). DELETE /api/tasks/[id].

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";
import { EVENT_CATEGORIES, TASK_STATUSES } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: {
    title?: string;
    category?: string;
    description?: string | null;
    dueAt?: Date | null;
    estMinutes?: number | null;
    importance?: number;
    status?: string;
    completedAt?: Date | null;
  } = {};

  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }
  if (EVENT_CATEGORIES.includes(body.category)) {
    data.category = body.category;
  }
  if (typeof body.description === "string") {
    data.description = body.description.trim() || null;
  }
  if (body.dueAt === null) {
    data.dueAt = null;
  } else if (typeof body.dueAt === "string" && body.dueAt) {
    const d = parseDateInput(body.dueAt, "23:59");
    if (!d) {
      return NextResponse.json({ error: "Invalid dueAt" }, { status: 400 });
    }
    data.dueAt = d;
  }
  if (body.estMinutes === null) {
    data.estMinutes = null;
  } else if (
    typeof body.estMinutes === "number" &&
    Number.isFinite(body.estMinutes) &&
    body.estMinutes > 0
  ) {
    data.estMinutes = Math.round(body.estMinutes);
  }
  if (typeof body.importance === "number" && Number.isFinite(body.importance)) {
    data.importance = Math.min(5, Math.max(1, Math.round(body.importance)));
  }
  if (typeof body.status === "string" && TASK_STATUSES.includes(body.status)) {
    data.status = body.status;
    data.completedAt = body.status === "COMPLETED" ? new Date() : null;
  }

  try {
    const task = await db.task.update({ where: { id }, data });
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
}
