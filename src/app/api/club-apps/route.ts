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
] as const;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clubId = typeof body.clubId === "string" ? body.clubId : null;
  if (!clubId) {
    return NextResponse.json({ error: "clubId is required" }, { status: 400 });
  }
  const club = await db.club.findUnique({ where: { id: clubId } });
  if (!club) {
    return NextResponse.json({ error: "Club not found" }, { status: 404 });
  }

  const app = await db.clubApplication.create({
    data: {
      clubId,
      cycle:
        typeof body.cycle === "string" && body.cycle.trim()
          ? body.cycle.trim()
          : null,
      opensAt: parseDateInput(body.opensAt, "09:00"),
      deadlineAt: parseDateInput(body.deadlineAt, "23:59"),
      interviewAt: parseDateInput(body.interviewAt, "17:00"),
      status: (APP_STATUSES as readonly string[]).includes(body.status)
        ? body.status
        : "NOT_OPEN",
      notes:
        typeof body.notes === "string" && body.notes.trim()
          ? body.notes.trim()
          : null,
    },
  });
  return NextResponse.json(app, { status: 201 });
}
