// TODAY — the daily command center. Everything the student needs to see when
// they open the app: top actions, alerts, today's classes with prep, work due
// and planned, upcoming tests, events, and the near-term workload strip.

import Link from "next/link";
import { addDays, endOfDay, isSameDay, startOfDay } from "date-fns";
import {
  getAlerts,
  getClassPreps,
  getEventsInRange,
  getRankedActions,
  getSessionsInRange,
  getOpenAssignments,
  getUpcomingExams,
  getWorkloadInputs,
  getProfile,
  getCurrentSemester,
} from "@/lib/data/queries";
import { forecastWorkload } from "@/lib/engine/workload";
import {
  daysUntil,
  dueLabel,
  fmtDayFull,
  fmtMinutes,
  fmtMinutesRange,
  fmtTime,
} from "@/lib/dates";
import {
  AlertRow,
  Card,
  CourseDot,
  EmptyState,
  LoadChip,
  PageHeader,
  PriorityTag,
  StatusPill,
} from "@/components/ui";
import AlertDismiss from "@/components/AlertDismiss";
import SessionCheck from "@/components/SessionCheck";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const now = new Date();
  const [
    { profile },
    semester,
    ranked,
    alerts,
    preps,
    sessions,
    events,
    assignments,
    exams,
    workloadInputs,
  ] = await Promise.all([
    getProfile(),
    getCurrentSemester(),
    getRankedActions(now),
    getAlerts(now),
    getClassPreps(now),
    getSessionsInRange(now, now),
    getEventsInRange(startOfDay(now), endOfDay(addDays(now, 0))),
    getOpenAssignments(21),
    getUpcomingExams(14),
    getWorkloadInputs(now, 7),
  ]);

  const workload = forecastWorkload(workloadInputs);
  const dueToday = assignments.filter((a) => a.dueAt && isSameDay(a.dueAt, now));
  const classesToday = preps.filter((p) => isSameDay(p.meetingStart, now));
  const laterPreps = preps.filter((p) => !isSameDay(p.meetingStart, now)).slice(0, 3);
  const urgentAlerts = alerts.filter((a) => a.severity !== "INFO").slice(0, 5);

  return (
    <div>
      <PageHeader
        title={`Today — ${fmtDayFull(now)}`}
        subtitle={
          profile
            ? `${semester?.name ?? ""} · ${profile.name.split(" ")[0]}'s command center`
            : "Run `npm run setup` to seed your semester."
        }
      />

      {urgentAlerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {urgentAlerts.map((a) => (
            <div key={a.key} className="flex items-start gap-2">
              <div className="flex-1">
                <Link href={a.href ?? "#"}>
                  <AlertRow severity={a.severity} title={a.title} body={a.body} />
                </Link>
              </div>
              <AlertDismiss alertKey={a.key} />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ------------ Left: top actions + work today ------------- */}
        <div className="space-y-6 lg:col-span-2">
          <Card title="My top actions today">
            {ranked.top.length === 0 ? (
              <EmptyState
                title="Nothing ranked yet"
                hint="Add courses and assignments, or run the seed."
              />
            ) : (
              <ol className="space-y-2.5">
                {ranked.top.map((action, i) => (
                  <li key={`${action.entityType}:${action.id}`} className="flex gap-3">
                    <span className="mt-0.5 w-5 text-right text-sm font-bold text-[var(--text-muted)]">
                      {i + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{action.title}</span>
                        {action.courseCode ? (
                          <span className="text-xs text-[var(--text-muted)]">
                            {action.courseCode}
                          </span>
                        ) : null}
                        <PriorityTag priority={action.priority} />
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {action.dueAt ? `${dueLabel(action.dueAt, now)} · ` : ""}
                        {action.estMinutes ? `~${fmtMinutes(action.estMinutes)} · ` : ""}
                        {action.reason}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card
            title="Planned work sessions today"
            action={
              <Link href="/planner" className="text-xs font-medium text-[var(--gold-deep)] hover:underline">
                Open planner →
              </Link>
            }
          >
            {sessions.length === 0 ? (
              <EmptyState
                title="No sessions planned for today"
                hint="Generate a study plan from an exam, or auto-plan an assignment."
              />
            ) : (
              <ul className="space-y-2">
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-3">
                    <SessionCheck sessionId={s.id} completed={s.completed} />
                    <div className="min-w-0 flex-1">
                      <div className={s.completed ? "text-sm line-through opacity-50" : "text-sm font-medium"}>
                        {s.focus}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {fmtMinutes(s.minutes)}
                        {s.startTime ? ` · ${s.startTime}` : ""} ·{" "}
                        {(s.assignment?.course ?? s.exam?.course ?? s.course)?.code ?? s.kind.replace(/_/g, " ").toLowerCase()}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Due today">
            {dueToday.length === 0 ? (
              <EmptyState title="Nothing due today" />
            ) : (
              <ul className="space-y-2">
                {dueToday.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5">
                    <CourseDot color={a.course.color} />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{a.title}</span>
                      <span className="ml-2 text-xs text-[var(--text-muted)]">
                        {a.course.code}
                        {a.dueAt ? ` · ${fmtTime(a.dueAt)}` : ""}
                        {a.estMinutes ? ` · ${fmtMinutesRange(a.estMinutes, a.estMinutesMax)}` : ""}
                      </span>
                    </div>
                    <StatusPill status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Classes today — before-class prep"
            action={
              <Link href="/courses" className="text-xs font-medium text-[var(--gold-deep)] hover:underline">
                All courses →
              </Link>
            }
          >
            {classesToday.length === 0 ? (
              <EmptyState title="No more classes today" />
            ) : (
              <div className="space-y-4">
                {classesToday.map((prep) => (
                  <div key={prep.courseId} className="rounded-lg border border-[var(--border)] p-3">
                    <div className="flex items-center justify-between">
                      <Link href={`/courses/${prep.courseId}`} className="text-sm font-bold hover:underline">
                        {prep.courseCode}
                      </Link>
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        {fmtTime(prep.meetingStart)}
                      </span>
                    </div>
                    {prep.items.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {prep.items.map((item, i) => (
                          <li key={i} className="flex items-baseline gap-2 text-[13px]">
                            <span className="text-[var(--gold-deep)]">•</span>
                            <span className="flex-1">{item.label}</span>
                            {item.estMinutes ? (
                              <span className="text-xs text-[var(--text-muted)]">
                                ~{fmtMinutes(item.estMinutes)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 rounded bg-[var(--surface-0)] px-2.5 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--gold-deep)]">5-min brief: </span>
                      {prep.brief}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ------------ Right rail ------------- */}
        <div className="space-y-6">
          <Card title="Next 7 days">
            <div className="space-y-1.5">
              {workload.map((d) => (
                <div key={d.date.toISOString()} className="flex items-center gap-2">
                  <span className="w-9 text-xs font-medium text-[var(--text-secondary)]">
                    {d.date.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <LoadChip level={d.level} />
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">
                    {d.notes.slice(0, 2).join(" · ")}
                  </span>
                </div>
              ))}
            </div>
            <Link
              href="/upcoming"
              className="mt-3 block text-xs font-medium text-[var(--gold-deep)] hover:underline"
            >
              Full 28-day forecast →
            </Link>
          </Card>

          <Card title="Tests & quizzes coming up">
            {exams.length === 0 ? (
              <EmptyState title="No exams in the next 14 days" />
            ) : (
              <ul className="space-y-2.5">
                {exams.map((e) => {
                  const days = daysUntil(e.startAt, now);
                  return (
                    <li key={e.id}>
                      <Link href={`/exams/${e.id}`} className="group block">
                        <div className="flex items-center gap-2">
                          <CourseDot color={e.course.color} />
                          <span className="text-sm font-semibold group-hover:underline">
                            {e.course.code} {e.title}
                          </span>
                        </div>
                        <div className="ml-[18px] text-xs text-[var(--text-secondary)]">
                          {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`} ·{" "}
                          {fmtTime(e.startAt)}
                          {e.weight ? ` · ${e.weight}% of grade` : ""}
                          {!e.planGeneratedAt && days <= 10 ? (
                            <span className="ml-1 font-semibold text-[var(--status-serious)]">
                              · no study plan yet
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Events today">
            {events.length === 0 ? (
              <EmptyState title="No events today" />
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id}>
                    <div className="text-sm font-medium">{e.title}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {fmtTime(e.startAt)}
                      {e.location ? ` · ${e.location}` : ""} ·{" "}
                      {e.category.toLowerCase()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {laterPreps.length > 0 && (
            <Card title="Prep for upcoming classes">
              <ul className="space-y-2">
                {laterPreps.map((p) => (
                  <li key={p.courseId} className="text-[13px]">
                    <span className="font-semibold">{p.courseCode}</span>{" "}
                    <span className="text-xs text-[var(--text-muted)]">
                      {p.meetingStart.toLocaleDateString("en-US", {
                        weekday: "short",
                      })}{" "}
                      {fmtTime(p.meetingStart)} · {p.items.length} prep item
                      {p.items.length === 1 ? "" : "s"} · ~{fmtMinutes(p.totalMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
