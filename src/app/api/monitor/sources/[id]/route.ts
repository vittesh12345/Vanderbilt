import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.label === "string" && body.label.trim())
    data.label = body.label.trim();
  if (typeof body.checkEveryHours === "number" && body.checkEveryHours >= 1)
    data.checkEveryHours = Math.round(body.checkEveryHours);
  try {
    const source = await db.monitoredSource.update({ where: { id }, data });
    return NextResponse.json(source);
  } catch {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.monitoredSource.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }
}
