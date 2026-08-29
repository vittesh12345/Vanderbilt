// POST /api/ingest/schedule/commit — YES/VSTAR schedule paste, step 2.
//
// Creates or updates courses and their weekly meetings from the reviewed
// candidates. Two rules carry over from syllabus intake:
//
//  * Meetings are replaced wholesale on update — the registrar's schedule is
//    authoritative for when a class meets, and a stale meeting is worse than
//    none (it puts phantom classes on the calendar).
//  * Scalar fields (title, professor, credits) are never silently
//    overwritten. When the paste disagrees with a value already on file, the
//    existing value stays and a Conflict row is raised for the student to
//    resolve. Filling in a field that was empty is not a disagreement.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseHM } from "@/lib/dates";
import { nextCourseColor } from "@/lib/palette";
import { findOrCreateCurrentSemester, findOrCreateSemesterNamed } from "@/lib/semester";

const MEETING_KINDS = ["LECTURE", "LAB", "DISCUSSION", "SEMINAR"];

interface IncomingMeeting {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location?: string | null;
  kind?: string;
}

interface IncomingCourse {
  code: string;
  title: string;
  credits?: number | null;
  professor?: string | null;
  location?: string | null;
  meetings?: IncomingMeeting[];
  existingCourseId?: string | null;
  mode?: "CREATE" | "UPDATE" | "SKIP";
}

function cleanMeetings(raw: unknown): IncomingMeeting[] {
  if (!Array.isArray(raw)) return [];
  const out: IncomingMeeting[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const { dayOfWeek, startTime, endTime, location, kind } = m as Record<
      string,
      unknown
    >;
    const day = Number(dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    if (typeof startTime !== "string" || parseHM(startTime) == null) continue;
    if (typeof endTime !== "string" || parseHM(endTime) == null) continue;
    if (parseHM(endTime)! <= parseHM(startTime)!) continue;
    out.push({
      dayOfWeek: day,
      startTime,
      endTime,
      location:
        typeof location === "string" && location.trim()
          ? location.trim().slice(0, 120)
          : null,
      kind:
        typeof kind === "string" && MEETING_KINDS.includes(kind)
          ? kind
          : "LECTURE",
    });
  }
  return out;
}

function str(v: unknown, max = 200): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const incoming: IncomingCourse[] = Array.isArray(body.courses)
    ? body.courses
    : [];
  if (!incoming.length) {
    return NextResponse.json({ error: "No courses selected." }, { status: 400 });
  }

  const termName = str(body.termName, 60);
  const semester =
    body.termMode === "NEW" && termName
      ? await findOrCreateSemesterNamed(termName)
      : await findOrCreateCurrentSemester();

  const usedColors = (
    await db.course.findMany({
      where: { semesterId: semester.id },
      select: { color: true },
    })
  ).map((c) => c.color);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const conflicts: string[] = [];
  const errors: string[] = [];

  for (const item of incoming) {
    const code = str(item.code, 20);
    const title = str(item.title, 160);
    if (item.mode === "SKIP") {
      skipped++;
      continue;
    }
    if (!code || !title) {
      errors.push(`Skipped a row missing a course code or title.`);
      skipped++;
      continue;
    }
    const meetings = cleanMeetings(item.meetings);
    const credits =
      typeof item.credits === "number" &&
      Number.isFinite(item.credits) &&
      item.credits > 0 &&
      item.credits <= 12
        ? item.credits
        : null;
    const professor = str(item.professor, 60);
    const location = str(item.location, 120);

    // Match by id when the review step found one, else by code in this
    // semester — a second paste of the same schedule must not duplicate.
    const existing = item.existingCourseId
      ? await db.course.findFirst({
          where: { id: item.existingCourseId, semesterId: semester.id },
        })
      : await db.course.findFirst({
          where: { semesterId: semester.id, code },
        });

    if (!existing) {
      const color = nextCourseColor(usedColors);
      usedColors.push(color);
      await db.course.create({
        data: {
          semesterId: semester.id,
          code,
          title,
          professor,
          location,
          credits: credits ?? 3,
          color,
          meetings: { create: meetings },
        },
      });
      created++;
      continue;
    }

    // Disagreements are flagged, never resolved for the student.
    const disagreements: {
      field: string;
      label: string;
      existing: string;
      incoming: string;
    }[] = [];
    if (title && existing.title && title !== existing.title) {
      disagreements.push({
        field: "title",
        label: "course title",
        existing: existing.title,
        incoming: title,
      });
    }
    if (professor && existing.professor && professor !== existing.professor) {
      disagreements.push({
        field: "professor",
        label: "instructor",
        existing: existing.professor,
        incoming: professor,
      });
    }
    if (credits !== null && existing.credits !== credits) {
      disagreements.push({
        field: "credits",
        label: "credit hours",
        existing: String(existing.credits),
        incoming: String(credits),
      });
    }

    for (const d of disagreements) {
      const already = await db.conflict.findFirst({
        where: {
          entityType: "COURSE",
          entityId: existing.id,
          field: d.field,
          status: "OPEN",
        },
      });
      if (already) continue;
      await db.conflict.create({
        data: {
          entityType: "COURSE",
          entityId: existing.id,
          field: d.field,
          description: `${existing.code} ${d.label} differs between your YES schedule and the record on file`,
          sourceA: "YES schedule paste",
          valueA: d.incoming,
          sourceB: "Existing course record",
          valueB: d.existing,
          suggestion:
            "YES is the registrar's record — if it is right, update the course and resolve this.",
        },
      });
      conflicts.push(`${existing.code}: ${d.label}`);
    }

    await db.course.update({
      where: { id: existing.id },
      data: {
        // Gaps get filled; a value already on file is never replaced — any
        // disagreement became a Conflict row above. Title and credits are
        // always populated, so they only ever appear as conflicts.
        professor: existing.professor ?? professor,
        location: existing.location ?? location,
        ...(meetings.length ? { meetings: { deleteMany: {}, create: meetings } } : {}),
      },
    });
    updated++;
  }

  return NextResponse.json({
    created,
    updated,
    skipped,
    conflicts,
    errors,
    semester: { id: semester.id, name: semester.name },
  });
}
