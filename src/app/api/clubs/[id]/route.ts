import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const MEMBERSHIPS = [
  "PROSPECT",
  "INTERESTED",
  "MEMBER",
  "LEADER",
  "ALUMNI",
  "NOT_PURSUING",
];
const CATEGORIES = [
  "FINANCE",
  "CONSULTING",
  "TECH",
  "ENTREPRENEURSHIP",
  "AI",
  "BUSINESS",
  "VC_PE",
  "PRODUCT",
  "OTHER",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  const strFields = [
    "name",
    "description",
    "website",
    "applicationUrl",
    "meetingInfo",
    "recruitment",
    "interviewProcess",
    "requirements",
    "leadership",
    "contact",
    "priorityReason",
    "source",
  ] as const;
  for (const f of strFields) {
    const v = body[f];
    if (typeof v === "string") data[f] = v.trim() || null;
    else if (v === null) data[f] = null;
  }
  if (CATEGORIES.includes(body.category)) data.category = body.category;
  if (MEMBERSHIPS.includes(body.membership)) data.membership = body.membership;
  if (["HIGH", "MEDIUM", "LOW", "UNRANKED"].includes(body.priority)) {
    data.priority = body.priority;
  }
  if (["VERIFIED", "LIKELY", "UNVERIFIED"].includes(body.confidence)) {
    data.confidence = body.confidence;
  }
  if (body.markVerified === true) data.lastVerifiedAt = new Date();

  try {
    const club = await db.club.update({ where: { id }, data });
    return NextResponse.json(club);
  } catch {
    return NextResponse.json({ error: "Club not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.club.delete({ where: { id } }); // applications cascade
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Club not found" }, { status: 404 });
  }
}
