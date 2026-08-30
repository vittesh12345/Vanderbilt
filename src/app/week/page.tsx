// THIS WEEK — Monday-to-Sunday agenda for the current week. One section per
// day: class meetings, exams (prominent), due items, planned work sessions,
// and events, each day headed by its workload level. A summary strip up top
// counts deadlines, exams, planned work hours, and events.

import { addDays, isSameDay } from "date-fns";
import {
  getSessionsInRange,
  getUnifiedCalendar,
  getWorkloadInputs,
  type UnifiedEvent,
} from "@/lib/data/queries";
import { forecastWorkload } from "@/lib/engine/workload";
import { fmtDay, fmtDayFull, fmtMinutes, fmtTime, weekBounds } from "@/lib/dates";
import { Card, CourseDot, LoadChip, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

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

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      {children}
    </div>
  );
}

export default async function WeekPage() {
  const now = new Date();
  const { start, end } = weekBounds(now);
  const [calendar, sessions, workloadInputs] = await Promise.all([
    getUnifiedCalendar(start, end),
    getSessionsInRange(start, end),
    getWorkloadInputs(now, 7),
  ]);
  const workload = forecastWorkload(workloadInputs);

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const dueCount = calendar.filter((e) => e.kind === "DUE").length;
  const examCount = calendar.filter((e) => e.kind === "EXAM").length;
  const eventCount = calendar.filter((e) => e.kind === "EVENT").length;
  const plannedMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);

  return (
    <div>
      <PageHeader
        title="This week"
        subtitle={`${fmtDay(start)} – ${fmtDay(end)}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Deadlines" value={dueCount} hint="items due this week" />
        <Stat label="Exams & quizzes" value={examCount} hint="this week" />
        <Stat
          label="Planned work"
          value={plannedMinutes > 0 ? fmtMinutes(plannedMinutes) : "0 min"}
          hint={`${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
        />
        <Stat label="Events" value={eventCount} hint="club, career & more" />
      </div>

      <div className="space-y-4">
        {days.map((day) => {
          const isToday = isSameDay(day, now);
          const load = workload.find((d) => isSameDay(d.date, day));
          const onDay = (kind: UnifiedEvent["kind"]) =>
            calendar.filter((e) => e.kind === kind && isSameDay(e.startAt, day));
          const classes = onDay("CLASS");
          const exams = onDay("EXAM");
          const due = onDay("DUE");
          const events = onDay("EVENT");
          const daySessions = sessions.filter((s) => isSameDay(s.date, day));
          const empty =
            classes.length + exams.length + due.length + events.length +
              daySessions.length === 0;

          return (
            <Card
              key={day.toISOString()}
              className={isToday ? "border-[var(--gold)]" : undefined}
              title={
                <span className="flex items-center gap-2">
                  {fmtDayFull(day)}
                  {isToday ? (
                    <span className="rounded-full bg-[var(--gold)] px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-[var(--black)]">
                      Today
                    </span>
                  ) : null}
                </span>
              }
              action={load ? <LoadChip level={load.level} /> : undefined}
            >
              {empty ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Nothing scheduled.
                </p>
              ) : (
                <div className="space-y-3">
                  {exams.length > 0 && (
                    <div>
                      <GroupLabel>Exams</GroupLabel>
                      <div className="space-y-2">
                        {exams.map((e) => (
                          <div
                            key={e.id}
                            className="rounded-md border border-[var(--border)] border-l-4 bg-[var(--surface-0)] px-3 py-2"
                            style={{ borderLeftColor: e.color ?? "var(--status-serious)" }}
                          >
                            <div className="text-sm font-bold">{e.title}</div>
                            <div className="text-xs text-[var(--text-secondary)]">
                              {fmtTime(e.startAt)}
                              {e.endAt ? ` – ${fmtTime(e.endAt)}` : ""}
                              {e.location ? ` · ${e.location}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {classes.length > 0 && (
                    <div>
                      <GroupLabel>Classes</GroupLabel>
                      <ul className="space-y-1.5">
                        {classes.map((c) => (
                          <li
                            key={c.id}
                            className="flex flex-wrap items-center gap-2 text-[13px]"
                          >
                            <CourseDot color={c.color ?? "#8B8B8B"} />
                            <span className="font-medium">{c.title}</span>
                            <span className="text-xs text-[var(--text-muted)]">
                              {fmtTime(c.startAt)}
                              {c.endAt ? `–${fmtTime(c.endAt)}` : ""}
                              {c.location ? ` · ${c.location}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {due.length > 0 && (
                    <div>
                      <GroupLabel>Due</GroupLabel>
                      <ul className="space-y-1.5">
                        {due.map((d) => (
                          <li
                            key={d.id}
                            className="flex flex-wrap items-center gap-2 text-[13px]"
                          >
                            <CourseDot color={d.color ?? "#8B8B8B"} />
                            <span className="font-medium">{d.title}</span>
                            <span className="text-xs text-[var(--text-muted)]">
                              {fmtTime(d.startAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {daySessions.length > 0 && (
                    <div>
                      <GroupLabel>Planned work</GroupLabel>
                      <ul className="space-y-1.5">
                        {daySessions.map((s) => {
                          const code = (s.assignment?.course ?? s.exam?.course ?? s.course)?.code;
                          return (
                            <li
                              key={s.id}
                              className="flex flex-wrap items-center gap-2 text-[13px]"
                            >
                              <span className="text-[var(--gold-deep)]" aria-hidden>
                                •
                              </span>
                              <span
                                className={s.completed ? "line-through opacity-50" : "font-medium"}
                              >
                                {s.focus}
                              </span>
                              <span className="text-xs text-[var(--text-muted)]">
                                {fmtMinutes(s.minutes)}
                                {s.startTime ? ` · ${s.startTime}` : ""}
                                {code ? ` · ${code}` : ""}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {events.length > 0 && (
                    <div>
                      <GroupLabel>Events</GroupLabel>
                      <ul className="space-y-1.5">
                        {events.map((e) => (
                          <li
                            key={e.id}
                            className="flex flex-wrap items-center gap-2 text-[13px]"
                          >
                            <CategoryChip category={e.category} />
                            <span className="font-medium">{e.title}</span>
                            <span className="text-xs text-[var(--text-muted)]">
                              {fmtTime(e.startAt)}
                              {e.location ? ` · ${e.location}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
