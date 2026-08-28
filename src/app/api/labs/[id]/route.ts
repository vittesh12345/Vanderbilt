import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const STATUSES = [
  "RESEARCHING",
  "POTENTIAL_FIT",
  "CONTACTED",
  "FOLLOW_UP",
  "INTERVIEW",
  "ACCEPTED",
  "NOT_A_FIT",
];
const FIELDS = [
  "professor",
  "labName",
  "department",
  "area",
  "website",
  "contactEmail",
  "applicationProcess",
  "skillsRequired",
  "fitReason",
  "learnFirst",
  "couldOffer",
  "approach",
  "nextAction",
  "source",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const f of FIELDS) {
    const v = body[f];
    if (typeof v === "string") data[f] = v.trim().slice(0, 2000) || null;
  }
  // professor may not be nulled
  if (data.professor === null) delete data.professor;
  if (STATUSES.includes(body.status)) data.status = body.status;
  if (["YES", "NO", "UNKNOWN"].includes(body.acceptsUndergrads)) {
    data.acceptsUndergrads = body.acceptsUndergrads;
  }
  if (body.markVerified === true) data.lastVerifiedAt = new Date();
  try {
    const lab = await db.researchLab.update({ where: { id }, data });
    return NextResponse.json(lab);
  } catch {
    return NextResponse.json({ error: "Lab not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.researchLab.delete({ where: { id } }); // outreach cascades
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Lab not found" }, { status: 404 });
  }
}
