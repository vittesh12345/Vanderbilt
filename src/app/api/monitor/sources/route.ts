import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const KINDS = ["CLUB", "VU_CALENDAR", "RESEARCH", "STARTUP", "CAREER", "COURSE", "OTHER"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!/^https?:\/\/.+\..+/.test(url) || !label) {
    return NextResponse.json(
      { error: "A valid http(s) url and a label are required" },
      { status: 400 },
    );
  }
  const source = await db.monitoredSource.upsert({
    where: { url },
    create: {
      url,
      label,
      kind: KINDS.includes(body.kind) ? body.kind : "OTHER",
      checkEveryHours:
        typeof body.checkEveryHours === "number" && body.checkEveryHours >= 1
          ? Math.round(body.checkEveryHours)
          : 24,
    },
    update: { label, active: true },
  });
  return NextResponse.json(source, { status: 201 });
}
