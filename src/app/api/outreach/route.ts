import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";

const KINDS = ["EMAIL", "MEETING", "FOLLOW_UP", "INTERVIEW"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const labId = typeof body.labId === "string" ? body.labId : null;
  if (!labId) {
    return NextResponse.json({ error: "labId is required" }, { status: 400 });
  }
  const lab = await db.researchLab.findUnique({ where: { id: labId } });
  if (!lab) {
    return NextResponse.json({ error: "Lab not found" }, { status: 404 });
  }
  const at = parseDateInput(body.at, "12:00") ?? new Date();
  // Logging a new contact fulfills earlier reminders due on or before it.
  await db.researchOutreach.updateMany({
    where: { labId, followUpAt: { not: null, lte: at } },
    data: { followUpAt: null },
  });
  const entry = await db.researchOutreach.create({
    data: {
      labId,
      kind: KINDS.includes(body.kind) ? body.kind : "EMAIL",
      at,
      followUpAt: parseDateInput(body.followUpAt, "12:00"),
      notes:
        typeof body.notes === "string" && body.notes.trim()
          ? body.notes.trim().slice(0, 1000)
          : null,
    },
  });
  // Logging contact moves the pipeline forward automatically.
  if (lab.status === "RESEARCHING" || lab.status === "POTENTIAL_FIT") {
    await db.researchLab.update({
      where: { id: labId },
      data: { status: "CONTACTED" },
    });
  }
  return NextResponse.json(entry, { status: 201 });
}
