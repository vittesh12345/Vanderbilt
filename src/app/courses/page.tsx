// COURSES — grid of this semester's courses: identity dot, meeting summary,
// open-work count, and the next exam when one is within 30 days.

import Link from "next/link";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { getCourses, getCurrentSemester } from "@/lib/data/queries";
import { daysUntil, fmtDay } from "@/lib/dates";
import { Card, CourseDot, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"];
const DAY_LETTERS = ["Su", "M", "T", "W", "R", "F", "Sa"];

function meetingSummary(
  meetings: { dayOfWeek: number; startTime: string; endTime: string }[],
): string | null {
  if (!meetings.length) return null;
  // Group identical time slots so "MWF 10:10–11:00" reads as one phrase.
  const groups = new Map<string, number[]>();
  for (const m of meetings) {
    const key = `${m.startTime}–${m.endTime}`;
    groups.set(key, [...(groups.get(key) ?? []), m.dayOfWeek]);
  }
  return [...groups.entries()]
    .map(
      ([time, days]) =>
        `${[...new Set(days)].sort((a, b) => a - b).map((d) => DAY_LETTERS[d]).join("")} ${time}`,
    )
    .join(" · ");
}

export default async function CoursesPage() {
  const now = new Date();
  const [semester, courses, openCounts, upcomingExams] = await Promise.all([
    getCurrentSemester(),
    getCourses(),
    db.assignment.groupBy({
      by: ["courseId"],
      where: { status: { in: OPEN_STATUSES } },
      _count: { _all: true },
    }),
    db.exam.findMany({
      where: { startAt: { gte: now, lte: addDays(now, 30) } },
      orderBy: { startAt: "asc" },
    }),
  ]);

  const openByCourse = new Map(openCounts.map((c) => [c.courseId, c._count._all]));
  const nextExamByCourse = new Map<string, (typeof upcomingExams)[number]>();
  for (const e of upcomingExams) {
    if (!nextExamByCourse.has(e.courseId)) nextExamByCourse.set(e.courseId, e);
  }

  const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);

  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle={
          semester
            ? `${semester.name} · ${courses.length} course${courses.length === 1 ? "" : "s"} · ${totalCredits} credits`
            : "No semester set up yet"
        }
        action={
          <Link
            href="/courses/new"
            className="rounded-md bg-[var(--black)] px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            + Add course
          </Link>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          hint="Add your first course, or paste a syllabus into Syllabus Intake."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => {
            const open = openByCourse.get(c.id) ?? 0;
            const nextExam = nextExamByCourse.get(c.id);
            const summary = meetingSummary(c.meetings);
            return (
              <Link key={c.id} href={`/courses/${c.id}`} className="group block">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <div className="flex items-center gap-2.5">
                    <CourseDot color={c.color} />
                    <span className="text-sm font-bold group-hover:underline">{c.code}</span>
                    <span className="ml-auto text-xs text-[var(--text-muted)]">
                      {c.credits} cr
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                    {c.title}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {c.professor ?? "Professor TBD"}
                  </div>
                  {summary ? (
                    <div className="mt-2 text-xs text-[var(--text-muted)]">{summary}</div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2.5 text-xs">
                    <span
                      className={
                        open > 0
                          ? "font-semibold text-[var(--text-secondary)]"
                          : "text-[var(--text-muted)]"
                      }
                    >
                      {open} open assignment{open === 1 ? "" : "s"}
                    </span>
                    {nextExam ? (
                      <span className="font-semibold text-[var(--status-serious)]">
                        · {nextExam.title}{" "}
                        {daysUntil(nextExam.startAt, now) === 0
                          ? "today"
                          : daysUntil(nextExam.startAt, now) === 1
                            ? "tomorrow"
                            : fmtDay(nextExam.startAt)}
                      </span>
                    ) : null}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
