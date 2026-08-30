// POST /api/syllabus/parse — run the extraction pipeline on pasted text:
// heuristic parse → optional AI refinement → conflict detection against the
// course's existing records. Persists a SyllabusUpload row (status PARSED)
// so the review step can commit it later; nothing else is written yet.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { parseSyllabus } from "@/lib/parsers/syllabus";
import { refineSyllabusWithAI } from "@/lib/ai/claude";
import { detectConflicts } from "@/lib/conflicts";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const courseId = typeof body?.courseId === "string" ? body.courseId : "";
  const text = typeof body?.text === "string" ? body.text : "";
  const filename =
    typeof body?.filename === "string" && body.filename.trim()
      ? body.filename.trim().slice(0, 200)
      : null;

  if (!courseId) {
    return NextResponse.json({ error: "courseId is required." }, { status: 400 });
  }
  if (text.trim().length < 40) {
    return NextResponse.json(
      { error: "Syllabus text is too short to parse — paste at least 40 characters." },
      { status: 400 },
    );
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { semester: true, exams: true, assignments: true },
  });
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const defaultYear =
    course.semester?.startDate.getFullYear() ?? new Date().getFullYear();
  const heuristic = parseSyllabus(text, { defaultYear });
  const extraction = await refineSyllabusWithAI(text, heuristic);

  const conflicts = detectConflicts(extraction, {
    course: {
      id: course.id,
      code: course.code,
      gradeWeightsJson: course.gradeWeightsJson,
    },
    exams: course.exams.map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      startAt: e.startAt,
      source: e.source,
    })),
    assignments: course.assignments.map((a) => ({
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      source: a.source,
    })),
  });

  const upload = await db.syllabusUpload.create({
    data: {
      courseId: course.id,
      filename,
      rawText: text,
      extractionJson: toJson(extraction),
      aiUsed: extraction.aiUsed,
      status: "PARSED",
    },
  });

  return NextResponse.json({
    uploadId: upload.id,
    extraction,
    conflicts,
    aiUsed: extraction.aiUsed,
  });
}
