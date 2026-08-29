// POST /api/courses — create a course in the current semester (creating a
// semester if none exists), assign a stable identity color, and persist
// meetings + serialized JSON detail arrays.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { parseHM } from "@/lib/dates";
import { nextCourseColor } from "@/lib/palette";
import { findOrCreateCurrentSemester } from "@/lib/semester";

const MEETING_KINDS = ["LECTURE", "LAB", "DISCUSSION", "SEMINAR"];

interface MeetingInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  kind: string;
  location?: string | null;
}

function sanitizeMeetings(raw: unknown): {
  meetings: MeetingInput[];
  invalid: string[];
} {
  if (!Array.isArray(raw)) return { meetings: [], invalid: [] };
  const out: MeetingInput[] = [];
  const invalid: string[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const { dayOfWeek, startTime, endTime, kind, location } = m as Record<string, unknown>;
    if (typeof dayOfWeek !== "number" || dayOfWeek < 0 || dayOfWeek > 6) {
      invalid.push("day of week must be 0\u20136");
      continue;
    }
    if (typeof startTime !== "string" || parseHM(startTime) == null) {
      invalid.push(`start time "${String(startTime)}" must be 24h HH:MM (e.g. 10:10)`);
      continue;
    }
    if (typeof endTime !== "string" || parseHM(endTime) == null) {
      invalid.push(`end time "${String(endTime)}" must be 24h HH:MM (e.g. 11:00)`);
      continue;
    }
    out.push({
      dayOfWeek: Math.round(dayOfWeek),
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      kind:
        typeof kind === "string" && MEETING_KINDS.includes(kind) ? kind : "LECTURE",
      location:
        typeof location === "string" && location.trim() ? location.trim() : null,
    });
  }
  return { meetings: out, invalid };
}

function optionalString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!code || !title) {
    return NextResponse.json(
      { error: "code and title are required" },
      { status: 400 },
    );
  }

  const semester = await findOrCreateCurrentSemester();
  const existing = await db.course.findMany({
    where: { semesterId: semester.id },
    select: { color: true },
  });
  const color = nextCourseColor(existing.map((c) => c.color));
  const { meetings, invalid } = sanitizeMeetings(body.meetings);
  if (invalid.length) {
    return NextResponse.json(
      { error: `Invalid meeting: ${invalid[0]}` },
      { status: 400 },
    );
  }

  const credits = Number(body.credits);
  const difficulty = Number(body.difficulty);

  const course = await db.course.create({
    data: {
      semesterId: semester.id,
      code,
      title,
      professor: optionalString(body.professor),
      professorEmail: optionalString(body.professorEmail),
      location: optionalString(body.location),
      credits: Number.isFinite(credits) && credits > 0 ? credits : 3,
      difficulty:
        Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5
          ? difficulty
          : 3,
      targetGrade: optionalString(body.targetGrade),
      notes: optionalString(body.notes),
      color,
      gradeWeightsJson: toJson(Array.isArray(body.gradeWeights) ? body.gradeWeights : []),
      officeHoursJson: toJson(Array.isArray(body.officeHours) ? body.officeHours : []),
      linksJson: toJson(Array.isArray(body.links) ? body.links : []),
      ...(Array.isArray(body.materials)
        ? { materialsJson: toJson(body.materials) }
        : {}),
      meetings: { create: meetings },
    },
    include: { meetings: true },
  });

  return NextResponse.json(course, { status: 201 });
}
