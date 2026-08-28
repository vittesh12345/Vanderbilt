// Server-side data assembly: Prisma queries + engine composition.
// Pages (server components) and the chat context builder consume these.

import { addDays, endOfDay, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { daysUntil, parseHM, weekBounds } from "@/lib/dates";
import { computeAlerts } from "@/lib/engine/alerts";
import { buildClassPrep } from "@/lib/engine/classprep";
import {
  rankActions,
  topActions,
  type PriorityCandidate,
} from "@/lib/engine/priority";
import {
  detectHeavyWeeks,
  forecastWorkload,
  type WorkloadInputs,
} from "@/lib/engine/workload";
import type {
  AlertItem,
  ClassPrep,
  PriorityTiers,
  RankedAction,
} from "@/lib/types";

const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"];

// ---------------------------------------------------------------------------
// Profile / semester
// ---------------------------------------------------------------------------

export async function getProfile() {
  const profile = await db.profile.findFirst();
  // Merge with defaults: a stored "{}" must still yield arrays for every tier.
  const parsed = parseJson<Partial<PriorityTiers>>(profile?.tiersJson ?? "{}", {});
  const tiers: PriorityTiers = {
    tier1: parsed.tier1 ?? [],
    tier2: parsed.tier2 ?? [],
    tier3: parsed.tier3 ?? [],
  };
  return { profile, tiers };
}

export async function getCurrentSemester() {
  return (
    (await db.semester.findFirst({ where: { isCurrent: true } })) ??
    (await db.semester.findFirst({ orderBy: { startDate: "desc" } }))
  );
}

// ---------------------------------------------------------------------------
// Core pulls (scoped to the current semester's courses)
// ---------------------------------------------------------------------------

export async function getCourses() {
  const semester = await getCurrentSemester();
  return db.course.findMany({
    where: semester ? { semesterId: semester.id } : undefined,
    include: { meetings: true },
    orderBy: { code: "asc" },
  });
}

export async function getOpenAssignments(horizonDays?: number) {
  const semester = await getCurrentSemester();
  return db.assignment.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      ...(semester ? { course: { semesterId: semester.id } } : {}),
      ...(horizonDays
        ? { dueAt: { lte: addDays(new Date(), horizonDays) } }
        : {}),
    },
    include: { course: true },
    orderBy: { dueAt: "asc" },
  });
}

export async function getUpcomingExams(horizonDays = 60) {
  const now = new Date();
  const semester = await getCurrentSemester();
  // Floor is `now`, not start-of-day: an exam taken this morning shouldn't
  // keep ranking as a study action or "unplanned exam" all afternoon.
  return db.exam.findMany({
    where: {
      startAt: { gte: now, lte: addDays(now, horizonDays) },
      ...(semester ? { course: { semesterId: semester.id } } : {}),
    },
    include: { course: true },
    orderBy: { startAt: "asc" },
  });
}

export async function getSessionsInRange(start: Date, end: Date) {
  return db.workSession.findMany({
    where: { date: { gte: startOfDay(start), lte: endOfDay(end) } },
    include: { assignment: { include: { course: true } }, exam: { include: { course: true } }, course: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
}

export async function getEventsInRange(start: Date, end: Date) {
  return db.calendarEvent.findMany({
    where: { startAt: { gte: start, lte: end } },
    orderBy: { startAt: "asc" },
  });
}

export async function getOpenTasks() {
  return db.task.findMany({
    where: { status: { not: "COMPLETED" } },
    orderBy: { dueAt: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Priority candidates → ranked actions
// ---------------------------------------------------------------------------

type AssignmentWithCourse = Awaited<ReturnType<typeof getOpenAssignments>>[number];
type ExamWithCourse = Awaited<ReturnType<typeof getUpcomingExams>>[number];
type TaskRow = Awaited<ReturnType<typeof getOpenTasks>>[number];

export function buildCandidates(
  assignments: AssignmentWithCourse[],
  exams: ExamWithCourse[],
  tasks: TaskRow[],
  now: Date,
): PriorityCandidate[] {
  // `assignments` holds only OPEN work, so a dependency id that still appears
  // in the list is unfinished; one that doesn't is completed or deleted —
  // either way it no longer blocks.
  const openIds = new Set(assignments.map((a) => a.id));

  const candidates: PriorityCandidate[] = assignments.map((a) => {
    const deps = parseJson<string[]>(a.dependsOnJson, []);
    const dependenciesMet =
      deps.length === 0 || deps.every((id) => !openIds.has(id));
    return {
      id: a.id,
      entityType: "ASSIGNMENT" as const,
      title: a.title,
      courseCode: a.course.code,
      category: "ACADEMIC",
      dueAt: a.dueAt,
      estMinutes: a.estMinutes,
      gradeWeight: a.gradeWeight,
      importance: a.importance,
      difficulty: a.difficulty,
      status: a.status,
      dependenciesMet,
    };
  });

  for (const e of exams) {
    const days = daysUntil(e.startAt, now);
    if (e.startAt.getTime() < now.getTime() || days > 10) continue;
    candidates.push({
      id: e.id,
      entityType: "EXAM_STUDY",
      title: `Study for ${e.course.code} ${e.title}`,
      courseCode: e.course.code,
      category: "ACADEMIC",
      dueAt: e.startAt,
      estMinutes: 90, // today's slice of studying, not the whole plan
      gradeWeight: e.weight,
      importance: 5,
      difficulty: e.course.difficulty,
      status: e.planGeneratedAt ? "IN_PROGRESS" : "NOT_STARTED",
    });
  }

  for (const t of tasks) {
    candidates.push({
      id: t.id,
      entityType: "TASK",
      title: t.title,
      category: t.category,
      dueAt: t.dueAt,
      estMinutes: t.estMinutes,
      importance: t.importance,
      status: t.status,
    });
  }

  return candidates;
}

export async function getRankedActions(now = new Date()): Promise<{
  top: RankedAction[];
  all: RankedAction[];
}> {
  const [assignments, exams, tasks, { tiers }] = await Promise.all([
    getOpenAssignments(),
    getUpcomingExams(14),
    getOpenTasks(),
    getProfile(),
  ]);
  const candidates = buildCandidates(assignments, exams, tasks, now);
  const ctx = { now, tier1: tiers.tier1, tier2: tiers.tier2 };
  return { top: topActions(candidates, 5, ctx), all: rankActions(candidates, ctx) };
}

// ---------------------------------------------------------------------------
// Workload
// ---------------------------------------------------------------------------

export async function getWorkloadInputs(
  now = new Date(),
  horizonDays = 28,
): Promise<WorkloadInputs> {
  const [semester, courses, assignments, exams, sessions, events] = await Promise.all([
    getCurrentSemester(),
    getCourses(),
    getOpenAssignments(horizonDays),
    getUpcomingExams(horizonDays),
    getSessionsInRange(now, addDays(now, horizonDays)),
    getEventsInRange(startOfDay(now), addDays(now, horizonDays)),
  ]);

  // Outside the semester (break, summer) weekly meetings don't happen — an
  // empty meeting list keeps the forecast honest.
  const inSemester =
    !semester || (now >= semester.startDate && now <= endOfDay(semester.endDate));
  const classMeetings = inSemester
    ? courses.flatMap((c) =>
        c.meetings.map((m) => {
          const start = parseHM(m.startTime) ?? 0;
          const end = parseHM(m.endTime) ?? start + 60;
          return {
            dayOfWeek: m.dayOfWeek,
            minutes: Math.max(30, end - start),
            label: c.code,
          };
        }),
      )
    : [];

  return {
    now,
    horizonDays,
    classMeetings,
    assignments: assignments
      .filter((a) => a.dueAt)
      .map((a) => ({
        id: a.id,
        title: a.title,
        courseCode: a.course.code,
        dueAt: a.dueAt as Date,
        estMinutes: a.estMinutes,
        kind: a.kind,
      })),
    exams: exams.map((e) => ({
      id: e.id,
      title: e.title,
      courseCode: e.course.code,
      startAt: e.startAt,
      kind: e.kind,
    })),
    sessions: sessions
      .filter((s) => !s.completed)
      .map((s) => ({ date: s.date, minutes: s.minutes })),
    otherDeadlines: events
      .filter((e) => e.category !== "ACADEMIC" && /deadline|application|due/i.test(e.title + (e.description ?? "")))
      .map((e) => ({ title: e.title, at: e.startAt })),
  };
}

// ---------------------------------------------------------------------------
// Alerts (derived, minus dismissed)
// ---------------------------------------------------------------------------

export async function getAlerts(now = new Date()): Promise<AlertItem[]> {
  const [assignments, exams, tasks, conflicts, topics, workloadInputs, dismissed, { profile }] =
    await Promise.all([
      getOpenAssignments(30),
      getUpcomingExams(14),
      getOpenTasks(),
      db.conflict.findMany({ where: { status: "OPEN" } }),
      getCurrentSemester().then((semester) =>
        db.topic.findMany({
          where: {
            mastery: "NEEDS_REVIEW",
            ...(semester ? { course: { semesterId: semester.id } } : {}),
          },
          include: { course: true },
        }),
      ),
      getWorkloadInputs(now),
      db.dismissedAlert.findMany(),
      getProfile(),
    ]);

  const { start, end } = weekBounds(now);
  const weekSessions = await getSessionsInRange(start, end);
  const plannedWeekMinutes = weekSessions
    .filter((s) => !s.completed)
    .reduce((sum, s) => sum + s.minutes, 0);
  const classWeekMinutes = workloadInputs.classMeetings.reduce(
    (sum, m) => sum + m.minutes,
    0,
  );

  const alerts = computeAlerts({
    now,
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      courseCode: a.course.code,
      dueAt: a.dueAt,
      status: a.status,
    })),
    exams: exams.map((e) => ({
      id: e.id,
      title: e.title,
      courseCode: e.course.code,
      startAt: e.startAt,
      planGeneratedAt: e.planGeneratedAt,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      dueAt: t.dueAt,
      status: t.status,
    })),
    openConflicts: conflicts.map((c) => ({
      id: c.id,
      description: c.description,
      suggestion: c.suggestion,
    })),
    heavyWeeks: detectHeavyWeeks(workloadInputs),
    needsReviewTopics: topics.map((t) => ({
      id: t.id,
      name: t.name,
      courseCode: t.course.code,
    })),
    plannedWeekMinutes: plannedWeekMinutes + classWeekMinutes,
    weeklyBudgetMinutes: (profile?.weeklyHours ?? 40) * 60,
  });

  const dismissedKeys = new Set(dismissed.map((d) => d.alertKey));
  return alerts.filter((a) => !dismissedKeys.has(a.key));
}

// ---------------------------------------------------------------------------
// Class prep for courses meeting soon
// ---------------------------------------------------------------------------

export async function getClassPreps(now = new Date()): Promise<ClassPrep[]> {
  const semester = await getCurrentSemester();
  const courses = await db.course.findMany({
    where: semester ? { semesterId: semester.id } : undefined,
    include: {
      meetings: true,
      topics: true,
      assignments: { where: { status: { in: OPEN_STATUSES } } },
    },
  });

  const preps: ClassPrep[] = [];
  for (const c of courses) {
    if (!c.meetings.length) continue;
    const prep = buildClassPrep({
      courseId: c.id,
      courseCode: c.code,
      courseTitle: c.title,
      now,
      meetings: c.meetings.map((m) => ({
        dayOfWeek: m.dayOfWeek,
        startTime: m.startTime,
        endTime: m.endTime,
        kind: m.kind,
      })),
      openAssignments: c.assignments.map((a) => ({
        id: a.id,
        title: a.title,
        kind: a.kind,
        dueAt: a.dueAt,
        estMinutes: a.estMinutes,
        status: a.status,
      })),
      topics: c.topics.map((t) => ({
        name: t.name,
        mastery: t.mastery,
        confusions: parseJson<string[]>(t.confusionsJson, []),
      })),
    });
    if (prep) preps.push(prep);
  }
  return preps.sort((a, b) => a.meetingStart.getTime() - b.meetingStart.getTime());
}

// ---------------------------------------------------------------------------
// Unified calendar: expand recurring class meetings + merge derived events
// ---------------------------------------------------------------------------

export interface UnifiedEvent {
  id: string;
  title: string;
  category: string; // EVENT_CATEGORIES member
  kind: "CLASS" | "EXAM" | "DUE" | "SESSION" | "EVENT" | "OFFICE_HOURS";
  startAt: Date;
  endAt?: Date;
  location?: string;
  color?: string;
  courseCode?: string;
  href?: string;
}

export async function getUnifiedCalendar(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<UnifiedEvent[]> {
  const [courses, events] = await Promise.all([
    getCourses(),
    getEventsInRange(rangeStart, rangeEnd),
  ]);
  const [assignments, exams, sessions] = await Promise.all([
    db.assignment.findMany({
      // Completed/submitted work no longer renders as a "due" chip.
      where: {
        dueAt: { gte: rangeStart, lte: rangeEnd },
        status: { notIn: ["COMPLETED", "SUBMITTED"] },
      },
      include: { course: true },
    }),
    db.exam.findMany({
      where: { startAt: { gte: rangeStart, lte: rangeEnd } },
      include: { course: true },
    }),
    getSessionsInRange(rangeStart, rangeEnd),
  ]);

  const out: UnifiedEvent[] = [];

  // Expand weekly class meetings into concrete occurrences — clamped to the
  // semester, so breaks and summers don't show phantom classes.
  const semester = await getCurrentSemester();
  const expandStart =
    semester && startOfDay(semester.startDate) > startOfDay(rangeStart)
      ? startOfDay(semester.startDate)
      : startOfDay(rangeStart);
  const expandEnd =
    semester && endOfDay(semester.endDate) < rangeEnd
      ? endOfDay(semester.endDate)
      : rangeEnd;
  for (let day = expandStart; day <= expandEnd; day = addDays(day, 1)) {
    const dow = day.getDay();
    for (const c of courses) {
      for (const m of c.meetings) {
        if (m.dayOfWeek !== dow) continue;
        const startMins = parseHM(m.startTime);
        const endMins = parseHM(m.endTime);
        if (startMins == null) continue;
        const startAt = new Date(day);
        startAt.setMinutes(startMins);
        const endAt = new Date(day);
        endAt.setMinutes(endMins ?? startMins + 60);
        out.push({
          id: `${m.id}:${day.toISOString().slice(0, 10)}`,
          title: `${c.code} ${m.kind === "LECTURE" ? "" : m.kind.toLowerCase()}`.trim(),
          category: "ACADEMIC",
          kind: "CLASS",
          startAt,
          endAt,
          location: m.location ?? c.location ?? undefined,
          color: c.color,
          courseCode: c.code,
          href: `/courses/${c.id}`,
        });
      }
    }
  }

  for (const e of exams) {
    out.push({
      id: e.id,
      title: `${e.course.code} ${e.title}`,
      category: "ACADEMIC",
      kind: "EXAM",
      startAt: e.startAt,
      endAt: e.endAt ?? undefined,
      location: e.location ?? undefined,
      color: e.course.color,
      courseCode: e.course.code,
      href: `/exams/${e.id}`,
    });
  }

  for (const a of assignments) {
    if (!a.dueAt) continue;
    out.push({
      id: a.id,
      title: `${a.course.code}: ${a.title} due`,
      category: "ACADEMIC",
      kind: "DUE",
      startAt: a.dueAt,
      color: a.course.color,
      courseCode: a.course.code,
      href: `/assignments`,
    });
  }

  for (const s of sessions) {
    const courseCode =
      s.course?.code ?? s.assignment?.course.code ?? s.exam?.course.code;
    const startMins = s.startTime ? parseHM(s.startTime) : null;
    const startAt = new Date(s.date);
    if (startMins != null) startAt.setMinutes(startMins);
    out.push({
      id: s.id,
      title: s.focus,
      category: "ACADEMIC",
      kind: "SESSION",
      startAt,
      color: "#8B8B8B",
      courseCode: courseCode ?? undefined,
      href: "/planner",
    });
  }

  for (const e of events) {
    out.push({
      id: e.id,
      title: e.title,
      category: e.category,
      kind: "EVENT",
      startAt: e.startAt,
      endAt: e.endAt ?? undefined,
      location: e.location ?? undefined,
      href: "/calendar",
    });
  }

  return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

// ---------------------------------------------------------------------------
// Chat context pack — a compact JSON snapshot the AI answers from
// ---------------------------------------------------------------------------

export async function getChatContextPack(now = new Date()) {
  const [
    { profile, tiers },
    semester,
    courses,
    assignments,
    exams,
    tasks,
    ranked,
    alerts,
    preps,
    goals,
  ] = await Promise.all([
    getProfile(),
    getCurrentSemester(),
    getCourses(),
    getOpenAssignments(),
    getUpcomingExams(30),
    getOpenTasks(),
    getRankedActions(now),
    getAlerts(now),
    getClassPreps(now),
    db.goal.findMany({ where: { status: "ACTIVE" } }),
  ]);
  const sessions = await getSessionsInRange(now, addDays(now, 7));
  const workload = forecastWorkload(await getWorkloadInputs(now, 14));

  return {
    currentTime: now.toISOString(),
    student: {
      name: profile?.name,
      school: profile?.school,
      interests: parseJson<string[]>(profile?.interestsJson ?? "[]", []),
      priorityTiers: tiers,
    },
    semester: semester
      ? { name: semester.name, start: semester.startDate, end: semester.endDate }
      : null,
    courses: courses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      professor: c.professor,
      difficulty: c.difficulty,
      meetings: c.meetings.map((m) => ({
        day: m.dayOfWeek,
        start: m.startTime,
        end: m.endTime,
        kind: m.kind,
      })),
    })),
    openAssignments: assignments.map((a) => ({
      course: a.course.code,
      title: a.title,
      kind: a.kind,
      dueAt: a.dueAt,
      status: a.status,
      estMinutes: a.estMinutes,
      gradeWeight: a.gradeWeight,
    })),
    upcomingExams: exams.map((e) => ({
      course: e.course.code,
      title: e.title,
      kind: e.kind,
      startAt: e.startAt,
      weight: e.weight,
      hasStudyPlan: Boolean(e.planGeneratedAt),
      planRationale: e.planRationale,
    })),
    plannedSessionsNext7Days: sessions.map((s) => ({
      date: s.date,
      minutes: s.minutes,
      kind: s.kind,
      focus: s.focus,
      completed: s.completed,
    })),
    openTasks: tasks.map((t) => ({
      title: t.title,
      category: t.category,
      dueAt: t.dueAt,
      status: t.status,
    })),
    topActionsToday: ranked.top,
    activeAlerts: alerts.map((a) => ({
      kind: a.kind,
      severity: a.severity,
      title: a.title,
      body: a.body,
    })),
    beforeClassPrep: preps.slice(0, 6).map((p) => ({
      course: p.courseCode,
      meetingStart: p.meetingStart,
      items: p.items.map((i) => i.label),
      totalMinutes: p.totalMinutes,
    })),
    workloadNext14Days: workload.map((d) => ({
      date: d.date,
      level: d.level,
      notes: d.notes,
    })),
    longTermGoals: goals.map((g) => ({
      category: g.category,
      title: g.title,
      tier: g.tier,
      progress: g.progress,
    })),
  };
}
