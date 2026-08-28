// RESEARCH OS — the lab tracker: realistic-fit Vanderbilt labs with the full
// fit analysis (why this lab / why I'm a fit / learn first / could offer /
// how to approach), an outreach log with follow-up nudges, and a status
// pipeline from RESEARCHING to ACCEPTED.

import { db } from "@/lib/db";
import { daysUntil } from "@/lib/dates";
import { Card, EmptyState, PageHeader, SourceTag, Stat } from "@/components/ui";
import {
  EntityDelete,
  EntityStatusSelect,
  QuickAdd,
} from "@/components/TrackerControls";

export const dynamic = "force-dynamic";

const LAB_STATUSES = [
  "RESEARCHING",
  "POTENTIAL_FIT",
  "CONTACTED",
  "FOLLOW_UP",
  "INTERVIEW",
  "ACCEPTED",
  "NOT_A_FIT",
] as const;

const PIPELINE_ORDER: Record<string, number> = Object.fromEntries(
  LAB_STATUSES.map((s, i) => [s, i]),
);

export default async function ResearchPage() {
  const now = new Date();
  const labs = await db.researchLab.findMany({
    include: { outreach: { orderBy: { at: "desc" } } },
    orderBy: { updatedAt: "desc" },
  });

  const active = labs.filter((l) => l.status !== "NOT_A_FIT");
  const contacted = labs.filter((l) =>
    ["CONTACTED", "FOLLOW_UP", "INTERVIEW"].includes(l.status),
  );
  const followUpsDue = labs
    .filter((l) => !["NOT_A_FIT", "ACCEPTED"].includes(l.status))
    .flatMap((l) =>
    l.outreach.filter(
      (o) => o.followUpAt && daysUntil(o.followUpAt, now) <= 1,
    ).map((o) => ({ lab: l, outreach: o })),
  );

  const sorted = [...active].sort(
    (a, b) => (PIPELINE_ORDER[a.status] ?? 9) - (PIPELINE_ORDER[b.status] ?? 9),
  );
  const notAFit = labs.filter((l) => l.status === "NOT_A_FIT");

  return (
    <div>
      <PageHeader
        title="Research"
        subtitle="Labs with realistic undergraduate access, ranked by fit — not by professor fame"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Labs tracked" value={labs.length} />
        <Stat label="In contact" value={contacted.length} />
        <Stat
          label="Follow-ups due"
          value={followUpsDue.length}
          hint={followUpsDue.length ? "don't let these slip" : undefined}
        />
        <Stat
          label="Accepted"
          value={labs.filter((l) => l.status === "ACCEPTED").length}
        />
      </div>

      {followUpsDue.length > 0 && (
        <Card title="Follow-ups due" className="mb-6">
          <ul className="space-y-1.5">
            {followUpsDue.map(({ lab, outreach }) => (
              <li key={outreach.id} className="text-sm">
                <span className="font-semibold">{lab.professor}</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {" "}— follow up{" "}
                  {daysUntil(outreach.followUpAt as Date, now) < 0
                    ? "overdue"
                    : daysUntil(outreach.followUpAt as Date, now) === 0
                      ? "today"
                      : "tomorrow"}
                  {outreach.notes ? ` · ${outreach.notes}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          title="No labs tracked yet"
          hint="Run npm run seed:labs for a researched starter set, or add labs manually below."
        />
      ) : (
        <div className="space-y-4">
          {sorted.map((lab) => {
            const fit: { label: string; value: string | null }[] = [
              { label: "Why this lab / why I'm a fit", value: lab.fitReason },
              { label: "What I should learn first", value: lab.learnFirst },
              { label: "What I could offer", value: lab.couldOffer },
              { label: "How to approach", value: lab.approach },
            ];
            return (
              <Card key={lab.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{lab.professor}</span>
                  {lab.labName ? (
                    <span className="text-sm text-[var(--text-secondary)]">· {lab.labName}</span>
                  ) : null}
                  {lab.department ? (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                      {lab.department}
                    </span>
                  ) : null}
                  {lab.acceptsUndergrads === "YES" ? (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      takes undergrads
                    </span>
                  ) : null}
                  <SourceTag source={lab.confidence.toLowerCase()} verifiedAt={lab.lastVerifiedAt} />
                  <div className="ml-auto flex items-center gap-2">
                    <EntityStatusSelect
                      endpoint="/api/labs"
                      id={lab.id}
                      status={lab.status}
                      options={LAB_STATUSES}
                    />
                    <EntityDelete endpoint="/api/labs" id={lab.id} confirmText="Remove this lab?" />
                  </div>
                </div>
                {lab.area ? (
                  <p className="mt-1.5 text-[13px] text-[var(--text-secondary)]">{lab.area}</p>
                ) : null}
                {lab.skillsRequired ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Skills: {lab.skillsRequired}
                  </p>
                ) : null}
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {fit
                    .filter((f) => f.value)
                    .map((f) => (
                      <div key={f.label} className="rounded bg-[var(--surface-0)] px-2.5 py-1.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          {f.label}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">{f.value}</div>
                      </div>
                    ))}
                </div>
                {lab.nextAction ? (
                  <p className="mt-2 text-xs">
                    <span className="font-semibold text-[var(--gold-deep)]">Next action: </span>
                    {lab.nextAction}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  {lab.website ? (
                    <a href={lab.website} target="_blank" rel="noreferrer" className="text-[var(--gold-deep)] hover:underline">
                      Lab page
                    </a>
                  ) : null}
                  {lab.contactEmail ? (
                    <a href={`mailto:${lab.contactEmail}`} className="text-[var(--gold-deep)] hover:underline">
                      {lab.contactEmail}
                    </a>
                  ) : null}
                </div>
                {/* Outreach log */}
                <div className="mt-3 border-t border-[var(--border)] pt-2">
                  {lab.outreach.length > 0 && (
                    <ul className="mb-2 space-y-1">
                      {lab.outreach.map((o) => (
                        <li key={o.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                          <span className="font-medium">{o.kind.replace(/_/g, " ").toLowerCase()}</span>
                          {o.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {o.followUpAt ? (
                            <span className="text-[var(--status-warning)]">
                              follow up {o.followUpAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          ) : null}
                          {o.notes ? <span className="text-[var(--text-muted)]">· {o.notes}</span> : null}
                          <EntityDelete endpoint="/api/outreach" id={o.id} confirmText="Remove this log entry?" />
                        </li>
                      ))}
                    </ul>
                  )}
                  <QuickAdd
                    endpoint="/api/outreach"
                    buttonLabel="Log outreach"
                    extra={{ labId: lab.id }}
                    fields={[
                      { key: "kind", placeholder: "", type: "select", options: ["EMAIL", "MEETING", "FOLLOW_UP", "INTERVIEW"] },
                      { key: "at", placeholder: "", type: "date" },
                      { key: "followUpAt", placeholder: "", type: "date" },
                      { key: "notes", placeholder: "Notes (what you sent/asked)", width: "min-w-48" },
                    ]}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <Card title="Add a lab">
          <QuickAdd
            endpoint="/api/labs"
            buttonLabel="Track a lab"
            fields={[
              { key: "professor", placeholder: "Professor *", width: "min-w-40" },
              { key: "labName", placeholder: "Lab / group" },
              { key: "department", placeholder: "Department" },
              { key: "area", placeholder: "Research area", width: "min-w-52" },
              { key: "website", placeholder: "Lab page URL", width: "min-w-44" },
            ]}
          />
        </Card>
      </div>

      {notAFit.length > 0 && (
        <Card title="Ruled out" className="mt-6">
          <ul className="space-y-1">
            {notAFit.map((lab) => (
              <li key={lab.id} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                {lab.professor}
                {lab.labName ? ` · ${lab.labName}` : ""}
                <div className="ml-auto flex items-center gap-2">
                  <EntityStatusSelect endpoint="/api/labs" id={lab.id} status={lab.status} options={LAB_STATUSES} />
                  <EntityDelete endpoint="/api/labs" id={lab.id} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
