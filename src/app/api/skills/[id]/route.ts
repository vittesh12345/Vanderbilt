import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  const lvl = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(5, Math.max(1, Math.round(v)))
      : undefined;
  if (lvl(body.currentLevel) !== undefined) data.currentLevel = lvl(body.currentLevel);
  if (lvl(body.targetLevel) !== undefined) data.targetLevel = lvl(body.targetLevel);
  if (typeof body.nextAction === "string") data.nextAction = body.nextAction.trim() || null;
  if (typeof body.resource === "string") data.resource = body.resource.trim() || null;
  if (typeof body.timeRequired === "string") data.timeRequired = body.timeRequired.trim() || null;
  if (body.deadline === null) data.deadline = null;
  else if (typeof body.deadline === "string" && body.deadline) {
    const d = parseDateInput(body.deadline, "23:59");
    if (!d) return NextResponse.json({ error: "Invalid deadline" }, { status: 400 });
    data.deadline = d;
  }
  try {
    const skill = await db.skill.update({ where: { id }, data });
    return NextResponse.json(skill);
  } catch {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.skill.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
}
