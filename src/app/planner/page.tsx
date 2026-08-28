// STUDY PLANNER — the workload command center: 14-day load strip, heavy-week
// warnings, exams still missing a study plan, every upcoming planned session
// grouped by day, and this week's capacity against the weekly hour budget.

import Link from "next/link";
import { addDays, startOfDay } from "date-fns";
import {
  getProfile,
  getSessionsInRange,
  getUpcomingExams,
  getWorkloadInputs,
} from "@/lib/data/queries";
import { detectHeavyWeeks, forecastWorkload } from "@/lib/engine/workload";
import {
  daysUntil,
  fmtDateTime,
  fmtDay,
  fmtDayFull,
  fmtMinutes,
  weekBounds,
} from "@/lib/dates";
import {
  Card,
  CourseDot,
  EmptyState,
  LoadChip,
  PageHeader,
  ProgressBar,
} from "@/components/ui";
import GeneratePlanButton from "@/components/GeneratePlanButton";
import SessionCheck from "@/components/SessionCheck";

export const dynamic = "force-dynamic";

function KindChip({ kind }: { kind: string }) {
  return (
    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
      {kind.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

export default async function PlannerPage() {
  const now = new Date();
  const { start: weekStart, end: weekEnd } = weekBounds(now);

  const [{ profile }, inputs14, inputs28, exams14, sessions14, weekSessions] =
    await Promise.all([
      getProfile(),
      getWorkloadInputs(now, 14),
      getWorkloadInputs(now, 28),
      getUpcomingExams(14),
      getSessionsInRange(now, addDays(now, 14)),
      getSessionsInRange(weekStart, weekEnd),
    ]);

  const workload = forecastWorkload(inputs14);
  const heavyWeeks = detectHeavyWeeks(inputs28);
  const unplannedExams = exams14.filter((e) => !e.planGeneratedAt);
  const upcomingSessions = sessions14.filter((s) => !s.completed);

  // ---- Group upcoming sessions by day --------------------------------------
  const dayGroups = new Map<
    string,
    { date: Date; items: typeof upcomingSessions }
  >();
  for (const s of upcomingSessions) {
    const day = startOfDay(s.date);
    const key = day.toISOString();
    const group = dayGroups.get(key) ?? { date: day, items: [] };
    group.items.push(s);
    dayGroups.set(key, group);
  }
  const groups = [...dayGroups.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  // ---- Weekly capacity -----------------------------------------------------
  const plannedWeekMinutes = weekSessions
    .filter((s) => !s.completed)
    .reduce((sum, s) => sum + s.minutes, 0);
  const classWeekMinutes = inputs28.classMeetings.reduce(
    (sum, m) => sum + m.minutes,
    0,
  );
  const committedMinutes = plannedWeekMinutes + classWeekMinutes;
  const budgetMinutes = (profile?.weeklyHours ?? 40) * 60;
  const overBudget = committedMinutes > budgetMinutes;
  const pct = budgetMinutes > 0 ? (committedMinutes / budgetMinutes) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Study Planner"
        subtitle={`${upcomingSessions.length} planned session${
          upcomingSessions.length === 1 ? "" : "s"
        } in the next 14 days${
          unplannedExams.length
            ? ` · ${unplannedExams.length} exam${unplannedExams.length === 1 ? "" : "s"} without a plan`
            : ""
        }`}
      />

      {/* ------------ (a) 14-day workload strip ------------- */}
      <Card title="Next 14 days" className="mb-6">
        <div className="thin-scroll flex gap-2 overflow-x-auto pb-1">
          {workload.map((d) => (
            <div
              key={d.date.toISOString()}
              title={d.notes.length ? d.notes.join("\n") : undefined}
              className="w-[96px] shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-2 py-2 text-center"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {d.date.toLocaleDateString("en-US", { weekday: "short" })}
              </div>
              <div className="text-sm font-bold">{d.date.getDate()}</div>
              <div className="mt-1">
                <LoadChip level={d.level} />
              </div>
              <div className="mt-1.5 space-y-0.5">
                {d.notes.slice(0, 2).map((n, i) => (
                  <div
                    key={i}
                    className="truncate text-[10px] leading-tight text-[var(--text-muted)]"
                  >
                    {n}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ------------ Left: warnings + sessions by day ------------- */}
        <div className="space-y-6 lg:col-span-2">
          {/* (b) Heavy-week warnings */}
          {heavyWeeks.length > 0 && (
            <Card title="Heavy-week warnings">
              <div className="space-y-3">
                {heavyWeeks.map((w, i) => {
                  const counts = [
                    w.exams
                      ? `${w.exams} exam${w.exams === 1 ? "" : "s"}`
                      : null,
                    w.quizzes
                      ? `${w.quizzes} quiz${w.quizzes === 1 ? "" : "zes"}`
                      : null,
                    w.assignments
                      ? `${w.assignments} assignment${w.assignments === 1 ? "" : "s"}`
                      : null,
                    w.applications
                      ? `${w.applications} application deadline${w.applications === 1 ? "" : "s"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div
                      key={i}
                      className="rounded-md border border-[var(--border)] border-l-4 border-l-[var(--status-warning)] bg-white px-3 py-2"
                    >
                      <div className="text-[13px] font-semibold">
                        Heavy week: {fmtDay(w.start)} – {fmtDay(w.end)}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {counts || "Deadlines cluster in this window."}
                      </div>
                      {w.recommendations.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {w.recommendations.map((r, j) => (
                            <li
                              key={j}
                              className="flex items-baseline gap-1.5 text-xs text-[var(--text-secondary)]"
                            >
                              <span className="text-[var(--gold-deep)]">→</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* (d) Upcoming sessions grouped by day */}
          <Card title="Planned sessions — next 14 days">
            {groups.length === 0 ? (
              <EmptyState
                title="Nothing planned yet"
                hint="Generate a study plan from an exam, or auto-plan an assignment."
              />
            ) : (
              <div className="space-y-4">
                {groups.map((g) => (
                  <div key={g.date.toISOString()}>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {fmtDayFull(g.date)}
                    </h3>
                    <ul className="space-y-2">
                      {g.items.map((s) => {
                        const course =
                          s.course ?? s.assignment?.course ?? s.exam?.course;
                        return (
                          <li key={s.id} className="flex items-center gap-3">
                            <SessionCheck
                              sessionId={s.id}
                              completed={s.completed}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">
                                  {s.focus}
                                </span>
                                <KindChip kind={s.kind} />
                              </div>
                              <div className="text-xs text-[var(--text-muted)]">
                                {fmtMinutes(s.minutes)}
                                {s.startTime ? ` · ${s.startTime}` : ""}
                                {course ? ` · ${course.code}` : ""}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ------------ Right rail ------------- */}
        <div className="space-y-6">
          {/* (e) Weekly capacity */}
          <Card title="This week's capacity">
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-semibold">
                {fmtMinutes(committedMinutes)} committed
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                of {fmtMinutes(budgetMinutes)}
              </span>
            </div>
            <ProgressBar
              value={pct}
              color={overBudget ? "var(--status-serious)" : undefined}
            />
            <div className="mt-2 space-y-0.5 text-xs text-[var(--text-secondary)]">
              <div>Planned sessions: {fmtMinutes(plannedWeekMinutes)}</div>
              <div>Class time: {fmtMinutes(classWeekMinutes)}</div>
              <div className="text-[var(--text-muted)]">
                Budget: {profile?.weeklyHours ?? 40} hr/week outside-class +
                class time
              </div>
            </div>
            {overBudget ? (
              <p className="mt-2 text-xs font-semibold text-[var(--status-serious)]">
                {fmtMinutes(committedMinutes - budgetMinutes)} over budget —
                trim sessions, or spread work into next week.
              </p>
            ) : null}
          </Card>

          {/* (c) Unplanned exams call-to-action */}
          <Card title="Unplanned exams">
            {unplannedExams.length === 0 ? (
              <EmptyState
                title="Every exam in the next 14 days has a plan"
                hint="Nice — check back as new exams land."
              />
            ) : (
              <ul className="space-y-3">
                {unplannedExams.map((e) => {
                  const days = daysUntil(e.startAt, now);
                  return (
                    <li
                      key={e.id}
                      className="rounded-lg border border-[var(--border)] p-3"
                    >
                      <div className="flex items-center gap-2">
                        <CourseDot color={e.course.color} />
                        <Link
                          href={`/exams/${e.id}`}
                          className="text-sm font-semibold hover:underline"
                        >
                          {e.course.code} {e.title}
                        </Link>
                      </div>
                      <div className="ml-[18px] mt-0.5 text-xs text-[var(--text-secondary)]">
                        {days === 0
                          ? "Today"
                          : days === 1
                            ? "Tomorrow"
                            : `In ${days} days`}{" "}
                        · {fmtDateTime(e.startAt)}
                        {e.weight ? ` · ${e.weight}% of grade` : ""}
                      </div>
                      <div className="ml-[18px] mt-2">
                        <GeneratePlanButton examId={e.id} compact />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
