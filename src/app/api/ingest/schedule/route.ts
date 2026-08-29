// POST /api/ingest/schedule — YES/VSTAR schedule paste, step 1 (preview).
//
// Parses pasted schedule text into course candidates and tells the caller
// which codes already exist in the current semester. Writes nothing; the
// review step posts to /api/ingest/schedule/commit.
//
// This is the sanctioned path for YES data: the student copies their own
// schedule out of a session they authenticated themselves. Nothing here logs
// in, fetches from Vanderbilt, or stores a credential.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSemester } from "@/lib/data/queries";
import { parseScheduleText } from "@/lib/parsers/schedule";

const MAX_CHARS = 100_000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return NextResponse.json(
      { error: "Paste your schedule text first." },
      { status: 400 },
    );
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: "That paste is too large — paste one term's schedule." },
      { status: 400 },
    );
  }

  const parsed = parseScheduleText(text);
  const semester = await getCurrentSemester();
  const existing = semester
    ? await db.course.findMany({
        where: { semesterId: semester.id },
        select: {
          id: true,
          code: true,
          title: true,
          professor: true,
          credits: true,
          _count: { select: { meetings: true, assignments: true, exams: true } },
        },
        orderBy: { code: "asc" },
      })
    : [];

  const byCode = new Map(
    existing.map((c) => [c.code.replace(/\s+/g, "").toUpperCase(), c]),
  );
  const courses = parsed.courses.map((c) => {
    const match = byCode.get(c.code.replace(/\s+/g, "").toUpperCase()) ?? null;
    return {
      ...c,
      existingCourseId: match?.id ?? null,
      existingTitle: match?.title ?? null,
      existingMeetingCount: match?._count.meetings ?? 0,
    };
  });

  // Courses already on file that this paste does not mention — usually the
  // demo seed, or a class that was dropped. Reported, never auto-deleted.
  const pastedCodes = new Set(
    parsed.courses.map((c) => c.code.replace(/\s+/g, "").toUpperCase()),
  );
  const notInPaste = existing
    .filter((c) => !pastedCodes.has(c.code.replace(/\s+/g, "").toUpperCase()))
    .map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      assignments: c._count.assignments,
      exams: c._count.exams,
    }));

  return NextResponse.json({
    term: parsed.term,
    warnings: parsed.warnings,
    courses,
    notInPaste,
    semester: semester
      ? { id: semester.id, name: semester.name, isCurrent: semester.isCurrent }
      : null,
  });
}
