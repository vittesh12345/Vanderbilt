// PATCH / DELETE a topic. PATCH accepts:
//   { mastery }      — set mastery; REVIEWED/PRACTICED/MASTERED stamps lastReviewedAt
//   { addConfusion } — prepend a "what I didn't understand" entry (cap 10) and
//                      flip the topic to NEEDS_REVIEW.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJson, toJson } from "@/lib/json";
import { MASTERY_LEVELS, type MasteryLevel } from "@/lib/types";

const MAX_CONFUSIONS = 10;
const REVIEW_STAMPING: MasteryLevel[] = ["REVIEWED", "PRACTICED", "MASTERED"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const topic = await db.topic.findUnique({ where: { id } });
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const data: {
    mastery?: string;
    lastReviewedAt?: Date;
    confusionsJson?: string;
  } = {};

  if (typeof body.addConfusion === "string" && body.addConfusion.trim()) {
    const confusions = parseJson<string[]>(topic.confusionsJson, []);
    data.confusionsJson = toJson(
      [body.addConfusion.trim(), ...confusions].slice(0, MAX_CONFUSIONS),
    );
    data.mastery = "NEEDS_REVIEW";
  }

  if (body.mastery !== undefined) {
    if (
      typeof body.mastery !== "string" ||
      !(MASTERY_LEVELS as readonly string[]).includes(body.mastery)
    ) {
      return NextResponse.json({ error: "Invalid mastery level" }, { status: 400 });
    }
    data.mastery = body.mastery;
    if (REVIEW_STAMPING.includes(body.mastery as MasteryLevel)) {
      data.lastReviewedAt = new Date();
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await db.topic.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.topic.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }
}
