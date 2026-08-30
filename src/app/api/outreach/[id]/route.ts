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
  if (body.followUpAt === null) data.followUpAt = null;
  else if (typeof body.followUpAt === "string" && body.followUpAt) {
    const d = parseDateInput(body.followUpAt, "12:00");
    if (!d) return NextResponse.json({ error: "Invalid followUpAt" }, { status: 400 });
    data.followUpAt = d;
  }
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;
  try {
    const entry = await db.researchOutreach.update({ where: { id }, data });
    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "Outreach not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.researchOutreach.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Outreach not found" }, { status: 404 });
  }
}
