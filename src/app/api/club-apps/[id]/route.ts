import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";

const APP_STATUSES = [
  "NOT_OPEN",
  "OPEN",
  "APPLYING",
  "SUBMITTED",
  "INTERVIEW",
  "ACCEPTED",
  "REJECTED",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (APP_STATUSES.includes(body.status)) {
    data.status = body.status;
    if (["ACCEPTED", "REJECTED"].includes(body.status)) {
      data.decisionAt = new Date();
    }
  }
  for (const [field, time] of [
    ["opensAt", "09:00"],
    ["deadlineAt", "23:59"],
    ["interviewAt", "17:00"],
  ] as const) {
    if (body[field] === null) data[field] = null;
    else if (typeof body[field] === "string" && body[field]) {
      const d = parseDateInput(body[field], time);
      if (!d) {
        return NextResponse.json(
          { error: `Invalid ${field}` },
          { status: 400 },
        );
      }
      data[field] = d;
    }
  }
  if (typeof body.cycle === "string") data.cycle = body.cycle.trim() || null;
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;

  try {
    const app = await db.clubApplication.update({ where: { id }, data });
    return NextResponse.json(app);
  } catch {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.clubApplication.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }
}
