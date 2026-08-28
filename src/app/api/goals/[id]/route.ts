// PATCH /api/goals/[id] — update goal fields (title, progress, tier, status,
// targetDate, milestones array → milestonesJson). When milestones are sent
// without an explicit progress, progress is recomputed from done/total.
// DELETE /api/goals/[id] — remove the goal.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import type { GoalMilestone } from "@/lib/types";

const GOAL_STATUSES = ["ACTIVE", "ACHIEVED", "DROPPED"];

function sanitizeMilestones(raw: unknown): GoalMilestone[] | null {
  if (!Array.isArray(raw)) return null;
  const out: GoalMilestone[] = [];
  for (const m of raw) {
    if (typeof m === "string") {
      const title = m.trim();
      if (title) out.push({ title, done: false });
    } else if (m && typeof m === "object" && typeof (m as { title?: unknown }).title === "string") {
      const mm = m as { title: string; done?: unknown; date?: unknown };
      const title = mm.title.trim();
      if (!title) continue;
      out.push({
        title,
        done: Boolean(mm.done),
        ...(typeof mm.date === "string" && mm.date ? { date: mm.date } : {}),
      });
    }
  }
  return out;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: {
    title?: string;
    description?: string | null;
    tier?: number;
    progress?: number;
    status?: string;
    targetDate?: Date | null;
    milestonesJson?: string;
  } = {};

  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }
  if (typeof body.description === "string") {
    data.description = body.description.trim() || null;
  }
  if (typeof body.tier === "number" && Number.isFinite(body.tier)) {
    data.tier = Math.min(3, Math.max(1, Math.round(body.tier)));
  }
  if (typeof body.progress === "number" && Number.isFinite(body.progress)) {
    data.progress = Math.min(100, Math.max(0, Math.round(body.progress)));
  }
  if (typeof body.status === "string" && GOAL_STATUSES.includes(body.status)) {
    data.status = body.status;
  }
  if (body.targetDate === null) {
    data.targetDate = null;
  } else if (typeof body.targetDate === "string" && body.targetDate) {
    const d = new Date(body.targetDate);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid targetDate" }, { status: 400 });
    }
    data.targetDate = d;
  }

  const milestones = sanitizeMilestones(body.milestones);
  if (milestones) {
    data.milestonesJson = toJson(milestones);
    if (data.progress === undefined && milestones.length > 0) {
      data.progress = Math.round(
        (milestones.filter((m) => m.done).length / milestones.length) * 100,
      );
    }
  }

  try {
    const goal = await db.goal.update({ where: { id }, data });
    return NextResponse.json(goal);
  } catch {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.goal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }
}
