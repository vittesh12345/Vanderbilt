// EXAMS & QUIZZES — every test on the horizon (next 60 days) with its study
// plan status, plus recent past exams for reference.

import Link from "next/link";
import { addDays, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { getCurrentSemester } from "@/lib/data/queries";
import { parseJson } from "@/lib/json";
import { daysUntil, fmtDateTime, fmtMinutes } from "@/lib/dates";
import { Card, CourseDot, EmptyState, PageHeader } from "@/components/ui";
import GeneratePlanButton from "@/components/GeneratePlanButton";

export const dynamic = "force-dynamic";

function untilLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

async function getExams(now: Date) {
  const semester = await getCurrentSemester();
  const scope = semester ? { course: { semesterId: semester.id } } : {};
  return Promise.all([
    db.exam.findMany({
      where: {
        ...scope,
        startAt: { gte: startOfDay(now), lte: addDays(now, 60) },
      },
      include: { course: true, workSessions: true },
      orderBy: { startAt: "asc" },
    }),
    db.exam.findMany({
      where: { ...scope, startAt: { lt: startOfDay(now) } },
      include: { course: true },
      orderBy: { startAt: "desc" },
      take: 10,
    }),
  ]);
}

export default async function ExamsPage() {
  const now = new Date();
  const [upcoming, past] = await getExams(now);
  const unplanned = upcoming.filter((e) => !e.planGeneratedAt).length;

  return (
    <div>
      <PageHeader
        title="Exams & Quizzes"
        subtitle={`${upcoming.length} in the next 60 days${
          unplanned ? ` · ${unplanned} without a study plan` : ""
        }`}
        action={
          <Link
            href="/exams/new"
            className="rounded-md bg-[var(--gold-deep)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            + Add exam
          </Link>
        }
      />

      <Card title="Upcoming" className="mb-6">
        {upcoming.length === 0 ? (
          <EmptyState
            title="No exams in the next 60 days"
            hint="Add one manually or run Syllabus Intake to extract exam dates."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {upcoming.map((e) => {
              const days = daysUntil(e.startAt, now);
              const topics = parseJson<string[]>(e.topicsJson, []);
              const planned = e.workSessions.filter(
                (s) => s.kind === "EXAM_STUDY",
              );
              const plannedMinutes = planned.reduce((sum, s) => sum + s.minutes, 0);
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CourseDot color={e.course.color} />
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">
                        {e.course.code}
                      </span>
                      <Link
                        href={`/exams/${e.id}`}
                        className="text-sm font-semibold hover:underline"
                      >
                        {e.title}
                      </Link>
                      <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                        {e.kind}
                      </span>
                    </div>
                    <div className="ml-[18px] mt-0.5 text-xs text-[var(--text-secondary)]">
                      {fmtDateTime(e.startAt)} ·{" "}
                      <span className="font-medium">{untilLabel(days)}</span>
                      {e.weight ? ` · ${e.weight}% of grade` : ""}
                      {topics.length
                        ? ` · ${topics.length} topic${topics.length === 1 ? "" : "s"}`
                        : ""}
                    </div>
                    <div className="ml-[18px] mt-0.5 text-xs">
                      {e.planGeneratedAt ? (
                        <span className="text-[var(--text-muted)]">
                          Plan: {planned.length} session
                          {planned.length === 1 ? "" : "s"},{" "}
                          {fmtMinutes(plannedMinutes)} total
                        </span>
                      ) : (
                        <span className="font-semibold text-[var(--status-serious)]">
                          No study plan
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <GeneratePlanButton
                      examId={e.id}
                      hasPlan={Boolean(e.planGeneratedAt)}
                      compact
                    />
                    <Link
                      href={`/exams/${e.id}`}
                      className="text-xs font-medium text-[var(--gold-deep)] hover:underline"
                    >
                      Details →
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Recent past exams">
        {past.length === 0 ? (
          <EmptyState title="No past exams recorded" />
        ) : (
          <ul className="space-y-2">
            {past.map((e) => (
              <li key={e.id} className="flex items-center gap-2.5">
                <CourseDot color={e.course.color} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/exams/${e.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {e.title}
                  </Link>
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    {e.course.code} · {e.kind.toLowerCase()} ·{" "}
                    {fmtDateTime(e.startAt)}
                    {e.weight ? ` · ${e.weight}% of grade` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
