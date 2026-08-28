import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";

const KINDS = [
  "TASK",
  "MILESTONE",
  "FUNDING",
  "COMPETITION",
  "PROGRAM",
  "MENTOR",
  "INVESTOR_OUTREACH",
  "CUSTOMER_OUTREACH",
  "LEGAL",
  "METRIC",
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const opt = (v: unknown, max = 1000) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const item = await db.startupItem.create({
    data: {
      kind: KINDS.includes(body.kind) ? body.kind : "TASK",
      title,
      details: opt(body.details, 2000),
      provider: opt(body.provider, 200),
      relevance: opt(body.relevance),
      nextAction: opt(body.nextAction),
      dueAt: parseDateInput(body.dueAt, "23:59"),
      url: opt(body.url, 500),
      source: opt(body.source, 500),
    },
  });
  return NextResponse.json(item, { status: 201 });
}
