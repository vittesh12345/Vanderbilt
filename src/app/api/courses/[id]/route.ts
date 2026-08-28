// GET / PATCH / DELETE a single course. PATCH accepts scalar fields plus the
// gradeWeights/officeHours/links/materials arrays (re-serialized with toJson);
// when body.meetings is an array the weekly meetings are replaced wholesale.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { parseHM } from "@/lib/dates";

const MEETING_KINDS = ["LECTURE", "LAB", "DISCUSSION", "SEMINAR"];

interface MeetingInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  kind: string;
  location?: string | null;
}

function sanitizeMeetings(raw: unknown[]): {
  meetings: MeetingInput[];
  invalid: string[];
} {
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
      invalid.push(`start time "${String(startTime)}" must be 24h HH:MM (e.g. 14:05)`);
      continue;
    }
    if (typeof endTime !== "string" || parseHM(endTime) == null) {
      invalid.push(`end time "${String(endTime)}" must be 24h HH:MM (e.g. 15:20)`);
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

/** "" → null, non-empty string → trimmed, anything else → undefined (skip). */
function scalarString(v: unknown): string | null | undefined {
  if (typeof v !== "string") return undefined;
  return v.trim() ? v.trim() : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const course = await db.course.findUnique({
    where: { id },
    include: { meetings: true },
  });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  return NextResponse.json(course);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};

  // Required-if-present strings: never blank out code/title.
  if (typeof body.code === "string" && body.code.trim()) data.code = body.code.trim();
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();

  for (const field of [
    "professor",
    "professorEmail",
    "location",
    "targetGrade",
    "currentGrade",
    "notes",
  ] as const) {
    const v = scalarString(body[field]);
    if (v !== undefined) data[field] = v;
  }

  if (typeof body.credits === "number" && body.credits > 0) {
    data.credits = body.credits;
  }
  if (
    typeof body.difficulty === "number" &&
    Number.isInteger(body.difficulty) &&
    body.difficulty >= 1 &&
    body.difficulty <= 5
  ) {
    data.difficulty = body.difficulty;
  }

  if (Array.isArray(body.gradeWeights)) data.gradeWeightsJson = toJson(body.gradeWeights);
  if (Array.isArray(body.officeHours)) data.officeHoursJson = toJson(body.officeHours);
  if (Array.isArray(body.links)) data.linksJson = toJson(body.links);
  if (Array.isArray(body.materials)) data.materialsJson = toJson(body.materials);

  try {
    const course = await db.course.update({ where: { id }, data });

    if (Array.isArray(body.meetings)) {
      // Reject malformed rows BEFORE deleting anything — a typo'd time must
      // never silently wipe an existing meeting.
      const { meetings, invalid } = sanitizeMeetings(body.meetings);
      if (invalid.length) {
        return NextResponse.json(
          { error: `Invalid meeting: ${invalid[0]}` },
          { status: 400 },
        );
      }
      await db.courseMeeting.deleteMany({ where: { courseId: id } });
      if (meetings.length) {
        await db.courseMeeting.createMany({
          data: meetings.map((m) => ({ ...m, courseId: id })),
        });
      }
    }

    const withMeetings = await db.course.findUnique({
      where: { id: course.id },
      include: { meetings: true },
    });
    return NextResponse.json(withMeetings ?? course);
  } catch {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.course.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
}
