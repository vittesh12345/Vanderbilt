import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key : null;
  if (!key) {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }
  await db.dismissedAlert.upsert({
    where: { alertKey: key },
    create: { alertKey: key },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
