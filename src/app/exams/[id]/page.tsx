// EXAM DETAIL — everything about one test: logistics, WHY the recommended
// amount of studying, topics in scope cross-referenced with the course's
// mastery tracker, and the planned study sessions.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import clsx from "clsx";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { daysUntil, fmtDateTime, fmtDay, fmtMinutes, fmtTime } from "@/lib/dates";
import { Card, CourseDot, EmptyState } from "@/components/ui";
import GeneratePlanButton from "@/components/GeneratePlanButton";
import SessionCheck from "@/components/SessionCheck";

export const dynamic = "force-dynamic";

const MASTERY_STYLES: Record<string, string> = {
  INTRODUCED: "bg-neutral-100 text-neutral-600 border-neutral-200",
  REVIEWED: "bg-blue-50 text-blue-700 border-blue-200",
  PRACTICED: "bg-amber-50 text-amber-700 border-amber-200",
  MASTERED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  NEEDS_REVIEW: "bg-red-50 text-red-700 border-red-200",
};

function untilLabel(days: number): string {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export default async function ExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const now = new Date();

  const exam = await db.exam.findUnique({
    where: { id },
    include: {
      course: { include: { topics: true } },
      workSessions: { orderBy: [{ date: "asc" }, { startTime: "asc" }] },
    },
  });
  if (!exam) notFound();

  async function deleteExam() {
    "use server";
    await db.exam.delete({ where: { id } }); // WorkSessions cascade
    redirect("/exams");
  }

  const days = daysUntil(exam.startAt, now);
  const topics = parseJson<string[]>(exam.topicsJson, []);
  const sessions = exam.workSessions;
  const plannedMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
  const hasPlan = Boolean(exam.planGeneratedAt);

  // Cross-reference exam topics with the course's mastery tracker
  // (case-insensitive contains, either direction).
  const masteryFor = (topic: string) => {
    const needle = topic.toLowerCase();
    return exam.course.topics.find((t) => {
      const name = t.name.toLowerCase();
      return name.includes(needle) || needle.includes(name);
    });
  };

  return (
    <div>
      {/* ---------------- Header ---------------- */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <CourseDot color={exam.course.color} />
            <h1 className="text-2xl font-bold tracking-tight">
              {exam.course.code} — {exam.title}
            </h1>
            <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
              {exam.kind}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {fmtDateTime(exam.startAt)}
            {exam.endAt ? ` – ${fmtTime(exam.endAt)}` : ""}
            {" · "}
            <span className="font-semibold">{untilLabel(days)}</span>
            {exam.location ? ` · ${exam.location}` : ""}
            {exam.weight ? ` · ${exam.weight}% of final grade` : ""}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            <Link
              href={`/courses/${exam.courseId}`}
              className="hover:text-[var(--gold-deep)] hover:underline"
            >
              {exam.course.title}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <GeneratePlanButton examId={exam.id} hasPlan={hasPlan} />
          <Link
            href={`/exams/${exam.id}/edit`}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3.5 py-2 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--gold-deep)] hover:text-[var(--gold-deep)]"
          >
            Edit
          </Link>
          <form action={deleteExam}>
            <button
              type="submit"
              className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3.5 py-2 text-sm font-medium text-[var(--status-critical)] hover:border-[var(--status-critical)]"
            >
              Delete
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ---------------- Left column ---------------- */}
        <div className="space-y-6 lg:col-span-2">
          <Card title="Why this much studying">
            {exam.planRationale ? (
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {exam.planRationale}
              </p>
            ) : (
              <EmptyState
                title="No study plan yet"
                hint="Generate one and the engine will explain how much prep this exam warrants."
              />
            )}
          </Card>

          <Card
            title={
              hasPlan
                ? `Study sessions — ${sessions.length} planned, ${fmtMinutes(plannedMinutes)} total`
                : "Study sessions"
            }
          >
            {sessions.length === 0 ? (
              <EmptyState
                title="No study sessions planned"
                hint="Generate a study plan to spread preparation across the days before the exam."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      <th className="py-1.5 pr-3" aria-label="Done" />
                      <th className="py-1.5 pr-4">Date</th>
                      <th className="py-1.5 pr-4">Focus</th>
                      <th className="py-1.5 pr-4">Time</th>
                      <th className="py-1.5">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td className="py-2 pr-3 align-top">
                          <SessionCheck sessionId={s.id} completed={s.completed} />
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4 align-top font-medium">
                          {fmtDay(s.date)}
                        </td>
                        <td
                          className={clsx(
                            "py-2 pr-4 align-top",
                            s.completed && "line-through opacity-50",
                          )}
                        >
                          {s.focus}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4 align-top text-xs text-[var(--text-secondary)]">
                          {fmtMinutes(s.minutes)}
                        </td>
                        <td className="py-2 align-top text-xs text-[var(--text-muted)]">
                          {s.rationale ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* ---------------- Right rail ---------------- */}
        <div className="space-y-6">
          <Card title={`Topics in scope (${topics.length})`}>
            {topics.length === 0 ? (
              <EmptyState
                title="No topics listed"
                hint="Edit the exam and add topics — one per line — so plans can target them."
              />
            ) : (
              <ul className="space-y-2">
                {topics.map((topic, i) => {
                  const match = masteryFor(topic);
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{topic}</span>
                      {match ? (
                        <span
                          className={clsx(
                            "inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                            MASTERY_STYLES[match.mastery] ??
                              MASTERY_STYLES.INTRODUCED,
                          )}
                        >
                          {match.mastery.replace(/_/g, " ")}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          not tracked
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">
              Mastery badges come from the course&rsquo;s topic tracker — update
              them on the{" "}
              <Link
                href={`/courses/${exam.courseId}`}
                className="text-[var(--gold-deep)] hover:underline"
              >
                course page
              </Link>
              .
            </p>
          </Card>

          {exam.notes ? (
            <Card title="Notes">
              <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                {exam.notes}
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
