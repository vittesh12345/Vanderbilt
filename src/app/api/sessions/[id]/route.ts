import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: { completed?: boolean; completedAt?: Date | null; minutes?: number } = {};
  if (typeof body.completed === "boolean") {
    data.completed = body.completed;
    data.completedAt = body.completed ? new Date() : null;
  }
  if (typeof body.minutes === "number" && body.minutes > 0) {
    data.minutes = Math.round(body.minutes);
  }

  try {
    const session = await db.workSession.update({ where: { id }, data });
    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.workSession.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}
