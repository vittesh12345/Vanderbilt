import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";

const KINDS = ["APPLICATION", "EVENT", "NETWORKING", "INTERVIEW", "RECRUITER", "OTHER"];
const TRACKS = ["FINANCE", "CONSULTING", "TECH", "OTHER"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const item = await db.careerItem.create({
    data: {
      kind: KINDS.includes(body.kind) ? body.kind : "OTHER",
      title,
      company:
        typeof body.company === "string" && body.company.trim()
          ? body.company.trim()
          : null,
      track: TRACKS.includes(body.track) ? body.track : null,
      at: parseDateInput(body.at, "17:00"),
      url: typeof body.url === "string" && body.url.trim() ? body.url.trim() : null,
      notes:
        typeof body.notes === "string" && body.notes.trim()
          ? body.notes.trim()
          : null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
