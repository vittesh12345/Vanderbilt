// STARTUP OS — the founder command center: milestones & tasks, Vanderbilt
// programs/funding/competitions (Wond'ry-heavy, seeded from research with
// provenance), mentors & outreach, and startup goals — all feeding the same
// alert and priority machinery.

import { db } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { dueLabel } from "@/lib/dates";
import { Card, EmptyState, PageHeader, ProgressBar, SourceTag, Stat } from "@/components/ui";
import {
  EntityDelete,
  EntityStatusSelect,
  QuickAdd,
} from "@/components/TrackerControls";
import type { GoalMilestone } from "@/lib/types";

export const dynamic = "force-dynamic";

const ITEM_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "DROPPED", "WATCHING"] as const;

export default async function StartupPage() {
  const now = new Date();
  const [items, goals, events] = await Promise.all([
    db.startupItem.findMany({ orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }] }),
    db.goal.findMany({ where: { category: "STARTUP", status: "ACTIVE" } }),
    db.calendarEvent.findMany({
      where: { category: "STARTUP", startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 6,
    }),
  ]);

  const openWork = items.filter(
    (i) => ["TASK", "MILESTONE"].includes(i.kind) && !["DONE", "DROPPED"].includes(i.status),
  );
  const programs = items.filter((i) =>
    ["PROGRAM", "COMPETITION", "FUNDING"].includes(i.kind),
  );
  const people = items.filter((i) =>
    ["MENTOR", "INVESTOR_OUTREACH", "CUSTOMER_OUTREACH"].includes(i.kind),
  );
  const upcomingDeadlines = [
    ...items.filter((i) => i.dueAt && i.dueAt >= now && !["DONE", "DROPPED"].includes(i.status)),
    ...events.filter((e) => /deadline|application|due/i.test(e.title)),
  ].length;

  const itemRow = (i: (typeof items)[number], showKind = false) => (
    <li key={i.id} className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{i.title}</span>
      {showKind ? (
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
          {i.kind.replace(/_/g, " ").toLowerCase()}
        </span>
      ) : null}
      {i.dueAt ? (
        <span className="text-xs text-[var(--text-secondary)]">{dueLabel(i.dueAt, now)}</span>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <EntityStatusSelect
          endpoint="/api/startup-items"
          id={i.id}
          status={i.status}
          options={ITEM_STATUSES}
        />
        <EntityDelete endpoint="/api/startup-items" id={i.id} />
      </div>
    </li>
  );

  return (
    <div>
      <PageHeader
        title="Startup"
        subtitle="Milestones, Vanderbilt resources, funding, and the people who can help"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open tasks & milestones" value={openWork.length} />
        <Stat label="Programs & funding tracked" value={programs.length} />
        <Stat label="Mentors & outreach" value={people.length} />
        <Stat label="Upcoming deadlines" value={upcomingDeadlines} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Milestones & tasks">
            {openWork.length === 0 ? (
              <EmptyState title="No open startup work" />
            ) : (
              <ul className="space-y-2">{openWork.map((i) => itemRow(i, true))}</ul>
            )}
            <div className="mt-3">
              <QuickAdd
                endpoint="/api/startup-items"
                buttonLabel="Add task / milestone"
                fields={[
                  { key: "title", placeholder: "What needs to happen", width: "min-w-56" },
                  { key: "kind", placeholder: "", type: "select", options: ["TASK", "MILESTONE", "LEGAL", "METRIC"] },
                  { key: "dueAt", placeholder: "", type: "date" },
                ]}
              />
            </div>
          </Card>

          <Card title="Vanderbilt programs, funding & competitions">
            {programs.length === 0 ? (
              <EmptyState
                title="Nothing tracked"
                hint="npm run seed:clubs loads the researched Wond'ry program set."
              />
            ) : (
              <div className="space-y-3">
                {programs.map((p) => (
                  <div key={p.id} className="rounded-lg border border-[var(--border)] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{p.title}</span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                        {p.kind.toLowerCase()}
                      </span>
                      <SourceTag
                        source={p.lastVerifiedAt ? "verified" : "unverified"}
                        verifiedAt={p.lastVerifiedAt}
                      />
                      <div className="ml-auto flex items-center gap-2">
                        <EntityStatusSelect
                          endpoint="/api/startup-items"
                          id={p.id}
                          status={p.status}
                          options={ITEM_STATUSES}
                        />
                        <EntityDelete endpoint="/api/startup-items" id={p.id} />
                      </div>
                    </div>
                    {p.details ? (
                      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{p.details}</p>
                    ) : null}
                    {p.nextAction ? (
                      <p className="mt-1 text-xs">
                        <span className="font-semibold text-[var(--gold-deep)]">Next / deadline info: </span>
                        {p.nextAction}
                      </p>
                    ) : null}
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-[var(--gold-deep)] hover:underline">
                        Official page →
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Startup goals">
            {goals.length === 0 ? (
              <EmptyState title="No startup goals" hint="Add them on Long-Term." />
            ) : (
              <div className="space-y-3">
                {goals.map((g) => {
                  const milestones = parseJson<GoalMilestone[]>(g.milestonesJson, []);
                  return (
                    <div key={g.id}>
                      <div className="text-sm font-semibold">{g.title}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="flex-1">
                          <ProgressBar value={g.progress} />
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">{g.progress}%</span>
                      </div>
                      {milestones.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {milestones.map((m, i) => (
                            <li key={i} className="text-xs text-[var(--text-secondary)]">
                              {m.done ? "✓" : "○"} {m.title}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Mentors & outreach">
            {people.length === 0 ? (
              <EmptyState title="No mentors or outreach tracked" />
            ) : (
              <ul className="space-y-2">{people.map((i) => itemRow(i, true))}</ul>
            )}
            <div className="mt-3">
              <QuickAdd
                endpoint="/api/startup-items"
                buttonLabel="Add mentor / outreach"
                fields={[
                  { key: "title", placeholder: "Who / what", width: "min-w-44" },
                  { key: "kind", placeholder: "", type: "select", options: ["MENTOR", "INVESTOR_OUTREACH", "CUSTOMER_OUTREACH"] },
                  { key: "dueAt", placeholder: "", type: "date" },
                ]}
              />
            </div>
          </Card>

          <Card title="Startup events">
            {events.length === 0 ? (
              <EmptyState title="No upcoming startup events" />
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id}>
                    <div className="text-sm font-medium">{e.title}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {e.startAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {e.location ? ` · ${e.location}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
