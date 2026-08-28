import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const professor = typeof body.professor === "string" ? body.professor.trim() : "";
  if (!professor) {
    return NextResponse.json({ error: "professor is required" }, { status: 400 });
  }
  const data: Record<string, unknown> = { professor };
  for (const f of FIELDS) {
    if (f === "professor") continue;
    const v = body[f];
    if (typeof v === "string" && v.trim()) data[f] = v.trim().slice(0, 2000);
  }
  if (["YES", "NO", "UNKNOWN"].includes(body.acceptsUndergrads)) {
    data.acceptsUndergrads = body.acceptsUndergrads;
  }
  if (["VERIFIED", "LIKELY", "UNVERIFIED"].includes(body.confidence)) {
    data.confidence = body.confidence;
  }
  const lab = await db.researchLab.create({ data: data as { professor: string } });
  return NextResponse.json(lab, { status: 201 });
}
