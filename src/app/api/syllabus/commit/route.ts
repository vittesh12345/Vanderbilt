// POST /api/syllabus/commit — write the reviewed selections into real rows:
// dated items become Assignments/Exams (deduped by normalized title + calendar
// day against what already exists), selected course info / grade weights /
// office hours / materials update the Course, and disagreements with the
// PRE-commit data are recorded as Conflict rows (never silently overwritten).

import { NextRequest, NextResponse } from "next/server";
import { isSameDay } from "date-fns";
import { db } from "@/lib/db";
import { parseJson, toJson } from "@/lib/json";
import { detectConflicts } from "@/lib/conflicts";
import { estimateMinutes } from "@/lib/engine/estimate";
import type {
  AssignmentKind,
  CourseMaterial,
  ExtractedDate,
  GradeWeight,
  OfficeHour,
  SyllabusExtraction,
} from "@/lib/types";

const DATE_KINDS: ExtractedDate["kind"][] = [
  "ASSIGNMENT",
  "EXAM",
  "QUIZ",
  "READING",
  "PROJECT_MILESTONE",
  "OTHER",
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

interface CommitDate {
  title: string;
  kind: ExtractedDate["kind"];
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  details?: string;
}

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Loose category↔title match via shared word prefixes ("Quizzes" ~ "Quiz 3"). */
function categoryMatchesTitle(category: string, title: string): boolean {
  const catWords = normTitle(category).split(" ");
  const titleWords = normTitle(title).split(" ");
  return catWords.some((c) =>
    titleWords.some(
      (t) =>
        c.length >= 3 && t.length >= 3 && (c.startsWith(t) || t.startsWith(c)),
    ),
  );
}

function optString(v: unknown, max = 500): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

function sanitizeDates(raw: unknown): CommitDate[] {
  if (!Array.isArray(raw)) return [];
  const out: CommitDate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const title = optString(r.title, 200);
    const date = typeof r.date === "string" ? r.date.trim() : "";
    if (!title || !DATE_RE.test(date)) continue;
    const kind = DATE_KINDS.includes(r.kind as ExtractedDate["kind"])
      ? (r.kind as ExtractedDate["kind"])
      : "OTHER";
    const time =
      typeof r.time === "string" && TIME_RE.test(r.time.trim())
        ? r.time.trim()
        : undefined;
    out.push({ title, kind, date, time, details: optString(r.details, 1000) });
  }
  return out;
}

function sanitizeWeights(raw: unknown): GradeWeight[] {
  if (!Array.isArray(raw)) return [];
  const out: GradeWeight[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const category = optString(r.category, 120);
    const weight = typeof r.weight === "number" ? r.weight : NaN;
    if (!category || !isFinite(weight) || weight <= 0 || weight > 100) continue;
    out.push({ category, weight });
  }
  return out;
}

function sanitizeOfficeHours(raw: unknown): OfficeHour[] {
  if (!Array.isArray(raw)) return [];
  const out: OfficeHour[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const day = optString(r.day, 20);
    const start = optString(r.start, 20);
    const end = optString(r.end, 20);
    if (!day || !start || !end) continue;
    out.push({
      day,
      start,
      end,
      location: optString(r.location, 120),
      note: optString(r.note, 300),
    });
  }
  return out;
}

function sanitizeMaterials(raw: unknown): CourseMaterial[] {
  if (!Array.isArray(raw)) return [];
  const out: CourseMaterial[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const title = optString(r.title, 300);
    if (!title) continue;
    out.push({
      title,
      author: optString(r.author, 200),
      required: typeof r.required === "boolean" ? r.required : true,
      notes: optString(r.notes, 500),
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const uploadId = typeof body?.uploadId === "string" ? body.uploadId : "";
  if (!uploadId) {
    return NextResponse.json({ error: "uploadId is required." }, { status: 400 });
  }

  const upload = await db.syllabusUpload.findUnique({
    where: { id: uploadId },
    include: { course: { include: { exams: true, assignments: true } } },
  });
  if (!upload || !upload.course) {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }
  const course = upload.course;

  const dates = sanitizeDates(body?.dates);
  const weights = sanitizeWeights(body?.gradeWeights);
  const officeHours = sanitizeOfficeHours(body?.officeHours);
  const materials = sanitizeMaterials(body?.materials);

  // Pre-commit snapshot — used both for dedupe and for conflict detection,
  // so newly-created rows never mask a disagreement with what was there.
  const existingItems = [
    ...course.assignments
      .filter((a) => a.dueAt)
      .map((a) => ({ title: normTitle(a.title), at: a.dueAt as Date })),
    ...course.exams.map((e) => ({ title: normTitle(e.title), at: e.startAt })),
  ];

  // Weight lookup pool: what the user just committed, else the course record.
  const weightPool = weights.length
    ? weights
    : parseJson<GradeWeight[]>(course.gradeWeightsJson, []);

  let createdAssignments = 0;
  let createdExams = 0;

  // A grade-weight category covers ALL items it matches ("Quizzes: 30%" over
  // Quiz 1..5) — divide the category weight across this batch's matches so a
  // single quiz never claims the whole 30%.
  const categoryMatchCount = new Map<string, number>();
  for (const d of dates) {
    if (d.kind !== "EXAM" && d.kind !== "QUIZ") continue;
    const w = weightPool.find((x) => categoryMatchesTitle(x.category, d.title));
    if (w) {
      categoryMatchCount.set(
        w.category,
        (categoryMatchCount.get(w.category) ?? 0) + 1,
      );
    }
  }

  for (const d of dates) {
    const isExam = d.kind === "EXAM" || d.kind === "QUIZ";
    const at = new Date(`${d.date}T${d.time ?? (isExam ? "09:00" : "23:59")}:00`);
    if (isNaN(at.getTime())) continue;

    const nt = normTitle(d.title);
    if (existingItems.some((x) => x.title === nt && isSameDay(x.at, at))) continue;
    existingItems.push({ title: nt, at });

    if (isExam) {
      const kind =
        d.kind === "QUIZ" ? "QUIZ" : /final/i.test(d.title) ? "FINAL" : "MIDTERM";
      const matched = weightPool.find((w) =>
        categoryMatchesTitle(w.category, d.title),
      );
      const weight = matched
        ? Math.round(
            (matched.weight /
              Math.max(1, categoryMatchCount.get(matched.category) ?? 1)) *
              10,
          ) / 10
        : null;
      await db.exam.create({
        data: {
          courseId: course.id,
          title: d.title,
          kind,
          startAt: at,
          weight,
          source: "SYLLABUS",
          notes: d.details ?? null,
        },
      });
      createdExams++;
    } else {
      const kind: AssignmentKind =
        d.kind === "READING"
          ? "READING"
          : d.kind === "PROJECT_MILESTONE"
            ? "PROJECT"
            : "HOMEWORK";
      const est = estimateMinutes({ kind, difficulty: course.difficulty });
      await db.assignment.create({
        data: {
          courseId: course.id,
          title: d.title,
          kind,
          dueAt: at,
          source: "SYLLABUS",
          description: d.details ?? null,
          estMinutes: est.minutes,
          estMinutesMax: est.minutesMax,
        },
      });
      createdAssignments++;
    }
  }

  // ---- Course updates: selected info fields + *_Json columns + raw text ----
  const courseData: {
    syllabusText: string;
    code?: string;
    title?: string;
    professor?: string;
    professorEmail?: string;
    location?: string;
    credits?: number;
    gradeWeightsJson?: string;
    officeHoursJson?: string;
    materialsJson?: string;
  } = { syllabusText: upload.rawText };

  const info =
    body?.courseInfo && typeof body.courseInfo === "object"
      ? (body.courseInfo as Record<string, unknown>)
      : {};
  let infoApplied = false;
  for (const key of [
    "code",
    "title",
    "professor",
    "professorEmail",
    "location",
  ] as const) {
    const v = optString(info[key], 300);
    if (v) {
      courseData[key] = v;
      infoApplied = true;
    }
  }
  if (
    typeof info.credits === "number" &&
    isFinite(info.credits) &&
    info.credits > 0
  ) {
    courseData.credits = info.credits;
    infoApplied = true;
  }

  let jsonApplied = false;
  if (weights.length) {
    courseData.gradeWeightsJson = toJson(weights);
    jsonApplied = true;
  }
  if (officeHours.length) {
    courseData.officeHoursJson = toJson(officeHours);
    jsonApplied = true;
  }
  if (materials.length) {
    courseData.materialsJson = toJson(materials);
    jsonApplied = true;
  }

  await db.course.update({ where: { id: course.id }, data: courseData });

  // ---- Conflict rows: committed selections vs the PRE-commit snapshot -----
  const sourceLabel = `Syllabus (uploaded ${upload.createdAt.toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" },
  )})`;
  const extractionForConflicts: SyllabusExtraction = {
    courseInfo: {},
    gradeWeights: weights.map((w) => ({ ...w, confidence: "HIGH" as const })),
    dates: dates.map((d) => ({
      title: d.title,
      kind: d.kind,
      date: d.date,
      time: d.time,
      confidence: "HIGH" as const,
    })),
    officeHours: [],
    materials: [],
    policies: [],
    objectives: [],
    warnings: [],
    aiUsed: upload.aiUsed,
  };
  const candidates = detectConflicts(
    extractionForConflicts,
    {
      course: {
        id: course.id,
        code: course.code,
        gradeWeightsJson: course.gradeWeightsJson, // pre-commit value
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
    },
    sourceLabel,
  );

  const openConflicts = await db.conflict.findMany({ where: { status: "OPEN" } });
  const openDescriptions = new Set(openConflicts.map((c) => c.description));
  let conflictsCreated = 0;
  for (const c of candidates) {
    if (openDescriptions.has(c.description)) continue; // don't duplicate an OPEN one
    openDescriptions.add(c.description);
    await db.conflict.create({
      data: {
        entityType: c.entityType,
        entityId: c.entityId ?? null,
        field: c.field,
        description: c.description,
        sourceA: c.sourceA,
        valueA: c.valueA,
        sourceB: c.sourceB,
        valueB: c.valueB,
        suggestion: c.suggestion,
      },
    });
    conflictsCreated++;
  }

  await db.syllabusUpload.update({
    where: { id: upload.id },
    data: { status: "COMMITTED", committedAt: new Date() },
  });

  return NextResponse.json({
    assignments: createdAssignments,
    exams: createdExams,
    conflictsCreated,
    courseUpdated: infoApplied || jsonApplied,
  });
}
