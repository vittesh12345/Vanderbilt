// UPCOMING — the next 6 weeks at a glance: major-deadline stats, heavy-week
// warnings with start-early recommendations, a 28-day workload heat strip,
// and a week-by-week list of exams, big deadlines, org events, and
// application deadlines.

import { addDays, startOfDay } from "date-fns";
import {
  getEventsInRange,
  getOpenAssignments,
  getUpcomingExams,
  getWorkloadInputs,
} from "@/lib/data/queries";
import { detectHeavyWeeks, forecastWorkload } from "@/lib/engine/workload";
import { dueLabel, fmtDay, fmtMinutes, weekBounds } from "@/lib/dates";
import { Card, CourseDot, EmptyState, LoadChip, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const HORIZON_DAYS = 42; // 6 weeks
const APPISH = /deadline|application|due/i;
const ORG_CATEGORIES = new Set(["CLUB", "CAREER", "STARTUP", "RESEARCH"]);

const CATEGORY_STYLES: Record<string, string> = {
  ACADEMIC: "bg-blue-50 text-blue-700 border-blue-200",
  CLUB: "bg-violet-50 text-violet-700 border-violet-200",
  CAREER: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RESEARCH: "bg-cyan-50 text-cyan-700 border-cyan-200",
  STARTUP: "bg-orange-50 text-orange-700 border-orange-200",
  PERSONAL: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

function CategoryChip({ category }: { category: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
        CATEGORY_STYLES[category] ?? CATEGORY_STYLES.PERSONAL
      }`}
    >
      {category.toLowerCase()}
    </span>
  );
}

function plural(n: number, word: string, pluralWord?: string) {
  return `${n} ${n === 1 ? word : pluralWord ?? `${word}s`}`;
}

export default async function UpcomingPage() {
  const now = new Date();
  const floor = startOfDay(now);
  const windowEnd = addDays(now, HORIZON_DAYS);

  const [workloadInputs, assignments, exams, events] = await Promise.all([
    getWorkloadInputs(now, HORIZON_DAYS),
    getOpenAssignments(HORIZON_DAYS),
    getUpcomingExams(HORIZON_DAYS),
    getEventsInRange(floor, windowEnd),
  ]);

  const heavyWeeks = detectHeavyWeeks(workloadInputs);
  const heat = forecastWorkload({ ...workloadInputs, horizonDays: 28 });

  const appish = (e: { title: string; description: string | null }) =>
    APPISH.test(e.title + (e.description ?? ""));

  // Single definition of "major" shared by the stat row and the week-by-week
  // list, over the same [floor, windowEnd] span, so the numbers agree.
  const isMajor = (a: {
    gradeWeight: number | null;
    kind: string;
    estMinutes: number | null;
  }) =>
    (a.gradeWeight ?? 0) >= 10 ||
    a.kind === "PROJECT" ||
    a.kind === "ESSAY" ||
    (a.estMinutes ?? 0) >= 180;
  const majorAssignments = assignments.filter(
    (a) => a.dueAt && a.dueAt >= floor && a.dueAt <= windowEnd && isMajor(a),
  );
  const appEvents = events.filter(appish);

  // Week-by-week windows: Monday of the current week, then five more.
  const { start: firstWeekStart } = weekBounds(now);
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const start = addDays(firstWeekStart, i * 7);
    return { start, end: addDays(start, 6) };
  });
  const inWeek = (d: Date, weekStart: Date) =>
    d >= weekStart && d < addDays(weekStart, 7);

  return (
    <div>
      <PageHeader
        title="Upcoming"
        subtitle={`Next 6 weeks · ${fmtDay(now)} – ${fmtDay(windowEnd)}`}
      />

      {/* ---------------- Summary stats ---------------- */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Major deadlines"
          value={majorAssignments.length + exams.length}
          hint={`${plural(majorAssignments.length, "big assignment")} · ${plural(exams.length, "exam/quiz", "exams/quizzes")}`}
        />
        <Stat
          label="Heavy weeks"
          value={heavyWeeks.length}
          hint="deadline clusters detected"
        />
        <Stat
          label="Application deadlines"
          value={appEvents.length}
          hint="applications & external due dates"
        />
      </div>

      {/* ---------------- Heavy weeks ---------------- */}
      <Card title="Heavy weeks & exam clusters" className="mb-6">
        {heavyWeeks.length === 0 ? (
          <EmptyState
            title="No heavy weeks detected"
            hint="Deadlines are spread out over the next 6 weeks."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {heavyWeeks.map((w) => (
              <div
                key={w.start.toISOString()}
                className="rounded-lg border border-[var(--border)] border-l-4 border-l-[var(--status-warning)] bg-[var(--surface-0)] p-3"
              >
                <div className="text-sm font-bold">
                  {fmtDay(w.start)} – {fmtDay(w.end)}
                </div>
                <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {plural(w.exams, "exam")} · {plural(w.quizzes, "quiz", "quizzes")} ·{" "}
                  {plural(w.assignments, "assignment")} ·{" "}
                  {plural(w.applications, "application")}
                </div>
                {w.recommendations.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {w.recommendations.map((r, i) => (
                      <li key={i} className="flex items-baseline gap-2 text-xs">
                        <span className="text-[var(--gold-deep)]" aria-hidden>
                          →
                        </span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---------------- 28-day heat strip ---------------- */}
      <Card title="28-day workload" className="mb-6">
        <div className="grid grid-cols-7 gap-1.5">
          {heat.map((d) => (
            <div
              key={d.date.toISOString()}
              className="flex flex-col items-center gap-1 rounded-md border border-[var(--border)] px-1 py-1.5"
            >
              <span className="text-[10px] font-medium text-[var(--text-muted)]">
                {d.date.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span className="text-xs font-bold">{d.date.getDate()}</span>
              <LoadChip level={d.level} />
            </div>
          ))}
        </div>
      </Card>

      {/* ---------------- Week by week ---------------- */}
      <Card title="Week by week">
        <div className="space-y-5">
          {weeks.map((w, wi) => {
            const wExams = exams.filter((e) => inWeek(e.startAt, w.start));
            const wMajors = assignments.filter(
              (a) =>
                a.dueAt &&
                a.dueAt >= floor &&
                a.dueAt <= windowEnd &&
                inWeek(a.dueAt, w.start) &&
                isMajor(a),
            );
            const wOrgEvents = events.filter(
              (e) =>
                inWeek(e.startAt, w.start) &&
                ORG_CATEGORIES.has(e.category) &&
                !appish(e),
            );
            const wApps = events.filter(
              (e) => inWeek(e.startAt, w.start) && appish(e),
            );
            const total =
              wExams.length + wMajors.length + wOrgEvents.length + wApps.length;

            return (
              <div key={w.start.toISOString()}>
                <div className="mb-1.5 flex items-center gap-2 border-b border-[var(--border)] pb-1">
                  <span className="text-[13px] font-bold">
                    {fmtDay(w.start)} – {fmtDay(w.end)}
                  </span>
                  {wi === 0 ? (
                    <span className="rounded-full bg-[var(--gold)] px-2 py-0.5 text-[10px] font-bold text-[var(--black)]">
                      This week
                    </span>
                  ) : null}
                </div>
                {total === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Nothing major scheduled.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {wExams.map((e) => (
                      <li
                        key={`exam-${e.id}`}
                        className="flex flex-wrap items-center gap-2 text-[13px]"
                      >
                        <CourseDot color={e.course.color} />
                        <span className="font-semibold">
                          {e.course.code} {e.title}
                        </span>
                        <span className="inline-block rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                          {e.kind}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {dueLabel(e.startAt, now)}
                          {e.weight ? ` · ${e.weight}% of grade` : ""}
                        </span>
                      </li>
                    ))}
                    {wMajors.map((a) => (
                      <li
                        key={`assignment-${a.id}`}
                        className="flex flex-wrap items-center gap-2 text-[13px]"
                      >
                        <CourseDot color={a.course.color} />
                        <span className="font-medium">
                          {a.course.code}: {a.title}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {a.dueAt ? dueLabel(a.dueAt, now) : ""}
                          {a.gradeWeight ? ` · ${a.gradeWeight}% of grade` : ""}
                          {a.estMinutes ? ` · ~${fmtMinutes(a.estMinutes)}` : ""}
                        </span>
                      </li>
                    ))}
                    {wApps.map((e) => (
                      <li
                        key={`application-${e.id}`}
                        className="flex flex-wrap items-center gap-2 text-[13px]"
                      >
                        <CategoryChip category={e.category} />
                        <span className="font-medium">{e.title}</span>
                        <span className="inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          APPLICATION
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {dueLabel(e.startAt, now)}
                        </span>
                      </li>
                    ))}
                    {wOrgEvents.map((e) => (
                      <li
                        key={`event-${e.id}`}
                        className="flex flex-wrap items-center gap-2 text-[13px]"
                      >
                        <CategoryChip category={e.category} />
                        <span>{e.title}</span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {fmtDay(e.startAt)}
                          {e.location ? ` · ${e.location}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
