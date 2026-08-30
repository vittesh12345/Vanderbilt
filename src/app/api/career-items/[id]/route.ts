import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";

const STATUSES = ["OPEN", "IN_PROGRESS", "SUBMITTED", "SCHEDULED", "DONE", "DROPPED"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (STATUSES.includes(body.status)) data.status = body.status;
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;
  if (body.at === null) data.at = null;
  else if (typeof body.at === "string" && body.at) {
    const d = parseDateInput(body.at, "17:00");
    if (!d) return NextResponse.json({ error: "Invalid at" }, { status: 400 });
    data.at = d;
  }
  try {
    const item = await db.careerItem.update({ where: { id }, data });
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
    await db.careerItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
}
