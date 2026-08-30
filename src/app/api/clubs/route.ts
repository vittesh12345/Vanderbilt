import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
const MEMBERSHIPS = [
  "PROSPECT",
  "INTERESTED",
  "MEMBER",
  "LEADER",
  "ALUMNI",
  "NOT_PURSUING",
];

function opt(v: unknown, max = 1000): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = opt(body.name, 200);
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const club = await db.club.create({
    data: {
      name,
      category: CATEGORIES.includes(body.category) ? body.category : "OTHER",
      description: opt(body.description, 2000),
      website: opt(body.website, 500),
      applicationUrl: opt(body.applicationUrl, 500),
      meetingInfo: opt(body.meetingInfo, 300),
      recruitment: opt(body.recruitment, 1000),
      interviewProcess: opt(body.interviewProcess, 1000),
      requirements: opt(body.requirements, 1000),
      contact: opt(body.contact, 300),
      membership: MEMBERSHIPS.includes(body.membership)
        ? body.membership
        : "PROSPECT",
      source: opt(body.source, 500) ?? "MANUAL",
      confidence: ["VERIFIED", "LIKELY", "UNVERIFIED"].includes(body.confidence)
        ? body.confidence
        : "UNVERIFIED",
      lastVerifiedAt:
        typeof body.lastVerifiedAt === "string" &&
        !isNaN(new Date(body.lastVerifiedAt).getTime())
          ? new Date(body.lastVerifiedAt)
          : null,
    },
  });
  return NextResponse.json(club, { status: 201 });
}
