// SETTINGS — profile & priorities, how the tiers feed the ranking engine,
// system status (AI mode, data counts, semester), and the integrations
// roadmap for later phases.

import { db } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { getCurrentSemester, getProfile } from "@/lib/data/queries";
import { Card, PageHeader, Stat } from "@/components/ui";
import ProfileForm from "@/components/ProfileForm";
import MonitorPanel, { type SourceRow } from "@/components/MonitorPanel";

export const dynamic = "force-dynamic";

const INTEGRATIONS: { name: string; phase: string; detail: string }[] = [
  {
    name: "Brightspace / VSTAR",
    phase: "Phase 2",
    detail:
      "iCal feed + calendar-export ingestion so assignments, due dates, and registration data flow in automatically.",
  },
  {
    name: "AnchorLink club monitoring",
    phase: "Phase 2",
    detail:
      "Watches club pages and application cycles, surfacing only meaningful changes.",
  },
  {
    name: "Google Calendar",
    phase: "Phase 3",
    detail: "Sync of the unified calendar with your personal Google Calendar.",
  },
];

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function SettingsPage() {
  const [
    { profile, tiers },
    semester,
    courseCount,
    assignmentCount,
    examCount,
    sessionCount,
    eventCount,
    goalCount,
    taskCount,
    openConflictCount,
    monitoredSources,
  ] = await Promise.all([
    getProfile(),
    getCurrentSemester(),
    db.course.count(),
    db.assignment.count(),
    db.exam.count(),
    db.workSession.count(),
    db.calendarEvent.count(),
    db.goal.count(),
    db.task.count(),
    db.conflict.count({ where: { status: "OPEN" } }),
    db.monitoredSource.findMany({ orderBy: { label: "asc" } }),
  ]);

  const sourceRows: SourceRow[] = monitoredSources.map((m) => ({
    id: m.id,
    url: m.url,
    label: m.label,
    kind: m.kind,
    active: m.active,
    checkEveryHours: m.checkEveryHours,
    lastCheckedAt: m.lastCheckedAt?.toISOString() ?? null,
    lastChangeAt: m.lastChangeAt?.toISOString() ?? null,
    lastChangeSummary: m.lastChangeSummary,
  }));

  const aiOn = Boolean(process.env.ANTHROPIC_API_KEY);

  const counts: { label: string; value: number }[] = [
    { label: "Courses", value: courseCount },
    { label: "Assignments", value: assignmentCount },
    { label: "Exams", value: examCount },
    { label: "Work sessions", value: sessionCount },
    { label: "Calendar events", value: eventCount },
    { label: "Goals", value: goalCount },
    { label: "Tasks", value: taskCount },
    { label: "Open conflicts", value: openConflictCount },
  ];

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Who you are, what you prioritize, and how the system is running."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ------------ Left: profile + priorities ------------- */}
        <div className="space-y-6 lg:col-span-2">
          <Card title="Profile">
            <ProfileForm
              initial={{
                name: profile?.name ?? "",
                email: profile?.email ?? "",
                gradYear: profile?.gradYear ?? null,
                weeklyHours: profile?.weeklyHours ?? 40,
                majors: parseJson<string[]>(profile?.majorsJson ?? "[]", []),
                interests: parseJson<string[]>(profile?.interestsJson ?? "[]", []),
                tiers,
              }}
            />
          </Card>

          <Card title="How priorities work">
            <div className="space-y-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              <p>
                The priority engine scores every open piece of work —
                assignments, exam prep, and tasks — and ranks them into your
                daily Top 5. A score is <em>not</em> a due-date sort: it adds
                up urgency, the daily pace required to finish on time (so an
                8-hour project due in 3 days outranks a 15-minute worksheet
                due tomorrow), grade weight, importance, and difficulty (hard
                material rewards early starts).
              </p>
              <p>
                Your tiers are the final ingredient. Each item carries a life
                category, and:
              </p>
              <ul className="space-y-1.5">
                <li className="flex items-baseline gap-2">
                  <span className="text-[var(--gold-deep)]">•</span>
                  <span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      Tier 1
                    </span>{" "}
                    categories get a solid scoring bump — this work rises in
                    the rankings and wins close calls.
                  </span>
                </li>
                <li className="flex items-baseline gap-2">
                  <span className="text-[var(--gold-deep)]">•</span>
                  <span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      Tier 2
                    </span>{" "}
                    categories get a smaller bump.
                  </span>
                </li>
                <li className="flex items-baseline gap-2">
                  <span className="text-[var(--gold-deep)]">•</span>
                  <span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      Tier 3
                    </span>{" "}
                    categories get none — they still rank on their own urgency
                    and weight, they just never jump the queue.
                  </span>
                </li>
              </ul>
              <p>
                Tiers never hide anything: an urgent Tier 3 deadline still
                beats idle Tier 1 work. They express what wins when two things
                are otherwise close.
              </p>
            </div>
          </Card>
        </div>

        {/* ------------ Right rail: status + roadmap ------------- */}
        <div className="space-y-6">
          <Card title="System status">
            <div className="mb-4 flex items-start gap-2.5">
              <span
                className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: aiOn
                    ? "var(--status-good)"
                    : "var(--status-warning)",
                }}
                aria-hidden
              />
              <div>
                <div className="text-sm font-semibold">
                  {aiOn ? "Claude connected" : "Heuristic mode"}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {aiOn
                    ? "Syllabus refinement and chat answers run through Claude."
                    : "Set ANTHROPIC_API_KEY in .env for AI answers — everything still works via the deterministic engines."}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {counts.map((c) => (
                <Stat key={c.label} label={c.label} value={c.value} />
              ))}
            </div>

            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Semester
              </div>
              {semester ? (
                <div className="mt-0.5 text-sm">
                  <span className="font-semibold">{semester.name}</span>
                  {semester.isCurrent ? (
                    <span className="ml-2 rounded-full border border-[var(--border)] bg-[var(--surface-0)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                      CURRENT
                    </span>
                  ) : null}
                  <div className="text-xs text-[var(--text-secondary)]">
                    {fmtDate(semester.startDate)} – {fmtDate(semester.endDate)}
                  </div>
                </div>
              ) : (
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                  No semester yet — run <code>npm run setup</code> to seed one.
                </div>
              )}
            </div>
          </Card>

          <Card title="Web monitoring">
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              Watched pages (club recruitment, Wond&apos;ry programs, calendars) are
              checked on their interval; only meaningful changes surface as
              alerts. Deploy with a daily cron hitting
              <code className="mx-1">POST /api/monitor/run</code>.
            </p>
            <MonitorPanel sources={sourceRows} />
          </Card>

          <Card title="Integrations roadmap">
            <ul className="space-y-3">
              {INTEGRATIONS.map((item) => (
                <li key={item.name}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{item.name}</span>
                    <span className="rounded border border-[var(--border)] bg-[var(--surface-0)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
                      {item.phase}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {item.detail}
                  </p>
                  <p className="text-[11px] italic text-[var(--text-muted)]">
                    Designed, not yet connected — see docs/ARCHITECTURE.md.
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
