// POST /api/exams/[id]/plan — generate (or regenerate) the exam's study plan.
// The engine (src/lib/engine/studyplan.ts) sizes total prep from grade weight,
// exam kind, course difficulty and weak topics, then spreads sessions toward
// the exam date. Previously planned (uncompleted) EXAM_STUDY sessions are
// replaced; completed ones are kept as history.

import { NextRequest, NextResponse } from "next/server";
import { startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { buildStudyPlan } from "@/lib/engine/studyplan";
import { EXAM_KINDS, type ExamKind } from "@/lib/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const exam = await db.exam.findUnique({
    where: { id },
    include: { course: { include: { topics: true } } },
  });
  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const now = new Date();
  const topics = parseJson<string[]>(exam.topicsJson, []);
  const weakTopics = exam.course.topics
    .filter((t) => t.mastery === "NEEDS_REVIEW")
    .map((t) => t.name);
  const kind: ExamKind = (EXAM_KINDS as readonly string[]).includes(exam.kind)
    ? (exam.kind as ExamKind)
    : "MIDTERM";

  const plan = buildStudyPlan({
    examId: exam.id,
    examTitle: exam.title,
    courseCode: exam.course.code,
    kind,
    startAt: exam.startAt,
    weight: exam.weight,
    courseDifficulty: exam.course.difficulty,
    topics,
    weakTopics,
    now,
  });

  if (plan.sessions.length === 0) {
    return NextResponse.json(
      { error: "The exam has already passed — nothing to plan." },
      { status: 400 },
    );
  }

  // Replace previously planned (uncompleted) study sessions for this exam.
  await db.workSession.deleteMany({
    where: { examId: id, kind: "EXAM_STUDY", completed: false },
  });
  await db.workSession.createMany({
    data: plan.sessions.map((s) => ({
      date: startOfDay(s.date),
      minutes: s.minutes,
      kind: "EXAM_STUDY",
      focus: s.focus,
      rationale: s.rationale,
      examId: id,
      courseId: exam.courseId,
    })),
  });
  await db.exam.update({
    where: { id },
    data: { planGeneratedAt: now, planRationale: plan.rationale },
  });

  return NextResponse.json({
    created: plan.sessions.length,
    totalMinutes: plan.totalMinutes,
    rationale: plan.rationale,
  });
}
