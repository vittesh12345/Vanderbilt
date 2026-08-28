import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";

const STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "DROPPED", "WATCHING"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (STATUSES.includes(body.status)) data.status = body.status;
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  for (const f of ["details", "nextAction", "relevance"] as const) {
    if (typeof body[f] === "string") data[f] = body[f].trim() || null;
  }
  if (body.dueAt === null) data.dueAt = null;
  else if (typeof body.dueAt === "string" && body.dueAt) {
    const d = parseDateInput(body.dueAt, "23:59");
    if (!d) return NextResponse.json({ error: "Invalid dueAt" }, { status: 400 });
    data.dueAt = d;
  }
  try {
    const item = await db.startupItem.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.startupItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
}
