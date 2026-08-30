import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";

const CATEGORIES = ["FINANCE", "CONSULTING", "TECH", "STARTUP", "GENERAL"];

function level(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(5, Math.max(1, Math.round(v)))
    : fallback;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const skill = await db.skill.create({
    data: {
      name,
      category: CATEGORIES.includes(body.category) ? body.category : "GENERAL",
      currentLevel: level(body.currentLevel, 1),
      targetLevel: level(body.targetLevel, 3),
      nextAction:
        typeof body.nextAction === "string" && body.nextAction.trim()
          ? body.nextAction.trim()
          : null,
      resource:
        typeof body.resource === "string" && body.resource.trim()
          ? body.resource.trim()
          : null,
      timeRequired:
        typeof body.timeRequired === "string" && body.timeRequired.trim()
          ? body.timeRequired.trim()
          : null,
      deadline: parseDateInput(body.deadline, "23:59"),
    },
  });
  return NextResponse.json(skill, { status: 201 });
}
