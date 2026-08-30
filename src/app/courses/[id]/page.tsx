// COURSE PROFILE — everything known about one course: meetings, grade
// weighting, office hours, materials, links, upcoming work, the topic/mastery
// tracker, and the syllabus trail.

import Link from "next/link";
import { notFound } from "next/navigation";
import { startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/json";
import {
  DAY_NAMES,
  daysUntil,
  dueLabel,
  fmtDateTime,
  fmtHM,
} from "@/lib/dates";
import type {
  CourseLink,
  CourseMaterial,
  GradeWeight,
  OfficeHour,
} from "@/lib/types";
import {
  Card,
  CourseDot,
  EmptyState,
  ProgressBar,
  StatusPill,
} from "@/components/ui";
import TopicManager from "@/components/TopicManager";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"];

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const now = new Date();

  const course = await db.course.findUnique({
    where: { id },
    include: {
      semester: true,
      meetings: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
      topics: { orderBy: { introducedAt: "asc" } },
      assignments: {
        where: { status: { in: OPEN_STATUSES } },
        orderBy: { dueAt: "asc" },
      },
      exams: {
        where: { startAt: { gte: startOfDay(now) } },
        orderBy: { startAt: "asc" },
      },
    },
  });
  if (!course) notFound();

  const gradeWeights = parseJson<GradeWeight[]>(course.gradeWeightsJson, []);
  const officeHours = parseJson<OfficeHour[]>(course.officeHoursJson, []);
  const links = parseJson<CourseLink[]>(course.linksJson, []);
  const materials = parseJson<CourseMaterial[]>(course.materialsJson, []);
  const weightTotal = gradeWeights.reduce((sum, w) => sum + (w.weight || 0), 0);
  const syllabusExcerpt = course.syllabusText
    ? course.syllabusText.trim().slice(0, 500)
    : null;

  const topics = course.topics.map((t) => ({
    id: t.id,
    name: t.name,
    mastery: t.mastery,
    confusions: parseJson<string[]>(t.confusionsJson, []),
    lastReviewedAt: t.lastReviewedAt ? t.lastReviewedAt.toISOString() : null,
  }));

  return (
    <div>
      {/* ---------------- Header ---------------- */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <CourseDot color={course.color} />
            <h1 className="text-2xl font-bold tracking-tight">
              {course.code} — {course.title}
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {course.professor ?? "Professor TBD"}
            {course.professorEmail ? (
              <>
                {" · "}
                <a
                  href={`mailto:${course.professorEmail}`}
                  className="text-[var(--gold-deep)] hover:underline"
                >
                  {course.professorEmail}
                </a>
              </>
            ) : null}
            {course.location ? ` · ${course.location}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {course.semester.name} · {course.credits} credit
            {course.credits === 1 ? "" : "s"} · difficulty {course.difficulty}/5
            {course.targetGrade ? ` · target ${course.targetGrade}` : ""}
            {course.currentGrade ? ` · current ${course.currentGrade}` : ""}
          </p>
        </div>
        <Link
          href={`/courses/${course.id}/edit`}
          className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3.5 py-2 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--gold-deep)] hover:text-[var(--gold-deep)]"
        >
          Edit course
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ---------------- Left column ---------------- */}
        <div className="space-y-6 lg:col-span-2">
          <Card title="Meetings">
            {course.meetings.length === 0 ? (
              <EmptyState title="No weekly meetings recorded" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      <th className="py-1.5 pr-4">Day</th>
                      <th className="py-1.5 pr-4">Time</th>
                      <th className="py-1.5 pr-4">Kind</th>
                      <th className="py-1.5">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {course.meetings.map((m) => (
                      <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 pr-4 font-medium">{DAY_NAMES[m.dayOfWeek]}</td>
                        <td className="py-2 pr-4">
                          {fmtHM(m.startTime)} – {fmtHM(m.endTime)}
                        </td>
                        <td className="py-2 pr-4 text-xs text-[var(--text-secondary)]">
                          {m.kind.toLowerCase()}
                        </td>
                        <td className="py-2 text-xs text-[var(--text-secondary)]">
                          {m.location ?? course.location ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Upcoming work">
            {course.assignments.length === 0 && course.exams.length === 0 ? (
              <EmptyState title="Nothing open for this course" />
            ) : (
              <ul className="space-y-2.5">
                {course.exams.map((e) => {
                  const days = daysUntil(e.startAt, now);
                  return (
                    <li key={e.id} className="flex items-center gap-2.5">
                      <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                        {e.kind}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/exams/${e.id}`} className="text-sm font-medium hover:underline">
                          {e.title}
                        </Link>
                        <span className="ml-2 text-xs text-[var(--text-muted)]">
                          {days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`} ·{" "}
                          {fmtDateTime(e.startAt)}
                          {e.weight ? ` · ${e.weight}% of grade` : ""}
                        </span>
                      </div>
                    </li>
                  );
                })}
                {course.assignments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5">
                    <StatusPill status={a.status} />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{a.title}</span>
                      <span className="ml-2 text-xs text-[var(--text-muted)]">
                        {a.kind.replace(/_/g, " ").toLowerCase()}
                        {a.dueAt ? ` · ${dueLabel(a.dueAt, now)}` : " · no due date"}
                        {a.gradeWeight ? ` · ${a.gradeWeight}% of grade` : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Topics & mastery">
            <TopicManager courseId={course.id} topics={topics} />
          </Card>

          <Card
            title="Syllabus"
            action={
              <Link
                href="/syllabus"
                className="text-xs font-medium text-[var(--gold-deep)] hover:underline"
              >
                Syllabus intake →
              </Link>
            }
          >
            {syllabusExcerpt ? (
              <p className="whitespace-pre-wrap rounded bg-[var(--surface-0)] px-3 py-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                {syllabusExcerpt}
                {course.syllabusText && course.syllabusText.trim().length > 500 ? "…" : ""}
              </p>
            ) : (
              <EmptyState
                title="No syllabus on file"
                hint="Paste the syllabus into Syllabus Intake to extract dates and weights."
              />
            )}
          </Card>
        </div>

        {/* ---------------- Right rail ---------------- */}
        <div className="space-y-6">
          <Card title="Grade weighting">
            {gradeWeights.length === 0 ? (
              <EmptyState title="No grade weights recorded" />
            ) : (
              <div className="space-y-2.5">
                {gradeWeights.map((w, i) => (
                  <div key={i}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="font-medium">{w.category}</span>
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">
                        {w.weight}%
                      </span>
                    </div>
                    <ProgressBar value={w.weight} color={course.color} />
                  </div>
                ))}
                <div className="pt-1 text-right text-[11px] text-[var(--text-muted)]">
                  Total {weightTotal}%
                </div>
              </div>
            )}
          </Card>

          <Card title="Office hours">
            {officeHours.length === 0 ? (
              <EmptyState title="No office hours recorded" />
            ) : (
              <ul className="space-y-2">
                {officeHours.map((o, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{o.day}</span>{" "}
                    <span className="text-[var(--text-secondary)]">
                      {fmtHM(o.start)} – {fmtHM(o.end)}
                    </span>
                    {o.location ? (
                      <span className="text-xs text-[var(--text-muted)]"> · {o.location}</span>
                    ) : null}
                    {o.note ? (
                      <div className="text-xs text-[var(--text-muted)]">{o.note}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Required materials">
            {materials.length === 0 ? (
              <EmptyState title="No materials listed" />
            ) : (
              <ul className="space-y-2">
                {materials.map((m, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{m.title}</span>
                    {m.author ? (
                      <span className="text-xs text-[var(--text-muted)]"> · {m.author}</span>
                    ) : null}
                    <span
                      className={
                        m.required
                          ? "ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]"
                          : "ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
                      }
                    >
                      {m.required ? "required" : "optional"}
                    </span>
                    {m.notes ? (
                      <div className="text-xs text-[var(--text-muted)]">{m.notes}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Important links">
            {links.length === 0 ? (
              <EmptyState title="No links saved" />
            ) : (
              <ul className="space-y-2">
                {links.map((l, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[var(--gold-deep)] hover:underline"
                    >
                      {l.label}
                    </a>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                      {l.kind.toLowerCase()}
                    </span>
                    {l.authRequired ? (
                      <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        login required
                      </span>
                    ) : null}
                    {l.notes ? (
                      <span className="w-full text-xs text-[var(--text-muted)]">{l.notes}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {course.notes ? (
            <Card title="Notes">
              <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                {course.notes}
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
