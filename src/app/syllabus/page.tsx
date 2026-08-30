// SYLLABUS INTELLIGENCE — paste a syllabus, review the structured extraction,
// commit it into Course/Assignment/Exam rows. Open cross-source conflicts are
// surfaced prominently here until resolved; recent uploads form the audit
// trail (what was parsed, when, with or without AI).

import { db } from "@/lib/db";
import { getCourses } from "@/lib/data/queries";
import { parseJson } from "@/lib/json";
import { fmtDay } from "@/lib/dates";
import { Card, CourseDot, EmptyState, PageHeader } from "@/components/ui";
import SyllabusIntake, { ConflictCard } from "@/components/SyllabusIntake";
import IcsIngest from "@/components/IcsIngest";
import ScheduleIntake from "@/components/ScheduleIntake";

export const dynamic = "force-dynamic";

function UploadStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PARSED: "bg-blue-50 text-blue-700 border-blue-200",
    COMMITTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    DISCARDED: "bg-neutral-100 text-neutral-500 border-neutral-200",
  };
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${styles[status] ?? styles.DISCARDED}`}
    >
      {status}
    </span>
  );
}

function AiBadge({ aiUsed }: { aiUsed: boolean }) {
  return aiUsed ? (
    <span className="inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
      AI-refined
    </span>
  ) : (
    <span className="inline-block rounded-full border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
      Heuristic
    </span>
  );
}

export default async function SyllabusPage() {
  const [courses, uploads, conflicts] = await Promise.all([
    getCourses(),
    db.syllabusUpload.findMany({
      include: { course: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.conflict.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const courseOptions = courses.map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    color: c.color,
    professor: c.professor,
    professorEmail: c.professorEmail,
    location: c.location,
    credits: c.credits,
  }));

  return (
    <div>
      <PageHeader
        title="Syllabus Intelligence"
        subtitle="Paste syllabus text; PDF extraction lands with the Brightspace connector — see docs/ARCHITECTURE.md"
      />

      {conflicts.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--status-serious)]">
            Open conflicts ({conflicts.length}) — two sources disagree; never
            silently pick one
          </h2>
          <div className="space-y-3">
            {conflicts.map((c) => (
              <ConflictCard
                key={c.id}
                conflictId={c.id}
                description={c.description}
                sourceA={c.sourceA}
                valueA={c.valueA}
                sourceB={c.sourceB}
                valueB={c.valueB}
                suggestion={c.suggestion}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Class schedule from YES">
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              Open YES, go to your class schedule, select the table (or the
              printable class list) and paste it below. Courses, meeting days,
              times, rooms, instructors, and credit hours come across in one
              step — you review every row before anything is saved. Nothing
              here logs into YES or touches your credentials: the text is
              yours, from a session you signed into yourself.
            </p>
            <ScheduleIntake />
          </Card>

          <div className="mt-6">
            <SyllabusIntake courses={courseOptions} />
          </div>

          <Card title="Brightspace / VSTAR calendar feed" className="mt-6">
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              Brightspace exposes a personal iCal subscription URL (Calendar
              &rarr; Settings &rarr; &quot;Enable Calendar Feeds&quot;). Paste it — or the
              .ics contents — and due dates, quizzes, and exams flow into the
              same review-and-commit pipeline. Legitimate access only: the feed
              URL is yours, no credentials are stored.
            </p>
            <IcsIngest />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Recent uploads">
            {uploads.length === 0 ? (
              <EmptyState
                title="No syllabi parsed yet"
                hint="Paste one on the left to get started."
              />
            ) : (
              <ul className="space-y-3">
                {uploads.map((u) => {
                  const extraction = parseJson<{ dates?: unknown[] }>(
                    u.extractionJson,
                    {},
                  );
                  const itemCount = Array.isArray(extraction.dates)
                    ? extraction.dates.length
                    : 0;
                  return (
                    <li key={u.id} className="flex items-start gap-2.5">
                      <span className="mt-1.5">
                        <CourseDot color={u.course.color} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {u.course.code}
                          {u.filename ? (
                            <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">
                              {u.filename}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {fmtDay(u.createdAt)} · {itemCount} extracted item
                          {itemCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <UploadStatusBadge status={u.status} />
                        <AiBadge aiUsed={u.aiUsed} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="How it works">
            <ol className="list-decimal space-y-1.5 pl-4 text-[13px] text-[var(--text-secondary)]">
              <li>Paste the syllabus text and parse it.</li>
              <li>
                Review every extracted item — confidence badges show what to
                double-check, and each row quotes the syllabus line it came from.
              </li>
              <li>
                Commit: checked items become assignments and exams; grade weights,
                office hours, and materials update the course record.
              </li>
              <li>
                Disagreements with existing records become conflict cards here —
                they are flagged, never silently overwritten.
              </li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
