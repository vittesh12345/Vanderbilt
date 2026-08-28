// POST /api/goals — create a long-term goal. Milestones arrive as an array
// (strings or {title, done, date?} objects) and are stored in milestonesJson.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { EVENT_CATEGORIES, type GoalMilestone } from "@/lib/types";

function sanitizeMilestones(raw: unknown): GoalMilestone[] {
  if (!Array.isArray(raw)) return [];
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const category = EVENT_CATEGORIES.includes(body.category) ? body.category : "PERSONAL";

  const tier =
    typeof body.tier === "number" && Number.isFinite(body.tier)
      ? Math.min(3, Math.max(1, Math.round(body.tier)))
      : 2;

  let targetDate: Date | null = null;
  if (typeof body.targetDate === "string" && body.targetDate) {
    targetDate = new Date(body.targetDate);
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json({ error: "Invalid targetDate" }, { status: 400 });
    }
  }

  const milestones = sanitizeMilestones(body.milestones);
  const doneCount = milestones.filter((m) => m.done).length;
  const progress =
    typeof body.progress === "number" && Number.isFinite(body.progress)
      ? Math.min(100, Math.max(0, Math.round(body.progress)))
      : milestones.length > 0
        ? Math.round((doneCount / milestones.length) * 100)
        : 0;

  const goal = await db.goal.create({
    data: {
      category,
      title,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null,
      tier,
      targetDate,
      progress,
      milestonesJson: toJson(milestones),
    },
  });

  return NextResponse.json(goal, { status: 201 });
}
