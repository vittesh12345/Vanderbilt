// CAREER OS — recruiting applications & interviews, career events and
// networking, and the professional-development skill matrix, wired into the
// same alert/priority machinery as everything else.

import { db } from "@/lib/db";
import { dueLabel, fmtDateTime } from "@/lib/dates";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import SkillMatrix, { type SkillRow } from "@/components/SkillMatrix";
import {
  EntityDelete,
  EntityStatusSelect,
  QuickAdd,
} from "@/components/TrackerControls";

export const dynamic = "force-dynamic";

const ITEM_STATUSES = ["OPEN", "IN_PROGRESS", "SUBMITTED", "SCHEDULED", "DONE", "DROPPED"] as const;
const KINDS = ["APPLICATION", "INTERVIEW", "EVENT", "NETWORKING", "RECRUITER", "OTHER"] as const;
const TRACKS = ["FINANCE", "CONSULTING", "TECH", "OTHER"] as const;

// First-year recruiting reality check — static guidance, clearly labeled.
const TIMELINE: { period: string; focus: string }[] = [
  { period: "Freshman fall", focus: "Clubs, exploration, GPA. Build the resume base — no formal recruiting yet." },
  { period: "Freshman spring", focus: "Coffee chats, insight programs (early-ID lists open late spring for finance)." },
  { period: "Sophomore fall–spring", focus: "Finance/consulting sophomore programs & diversity pipelines; tech internship apps open in fall." },
  { period: "Junior year", focus: "The main internship cycle — IB recruiting now starts up to a year ahead." },
];

export default async function CareerPage() {
  const now = new Date();
  const [items, skills, careerEvents] = await Promise.all([
    db.careerItem.findMany({ orderBy: [{ at: "asc" }] }),
    db.skill.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    db.calendarEvent.findMany({
      where: { category: "CAREER", startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 6,
    }),
  ]);

  const open = items.filter((i) => !["DONE", "DROPPED"].includes(i.status));
  const applications = open.filter((i) => ["APPLICATION", "RECRUITER"].includes(i.kind));
  const interviews = open.filter((i) => i.kind === "INTERVIEW");
  const networking = open.filter((i) => ["EVENT", "NETWORKING", "OTHER"].includes(i.kind));
  const skillsInProgress = skills.filter((s) => s.currentLevel < s.targetLevel);

  const skillRows: SkillRow[] = skills.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    currentLevel: s.currentLevel,
    targetLevel: s.targetLevel,
    nextAction: s.nextAction,
    resource: s.resource,
    timeRequired: s.timeRequired,
    deadline: s.deadline?.toISOString() ?? null,
  }));

  const itemRow = (i: (typeof items)[number]) => (
    <li key={i.id} className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{i.title}</span>
      {i.company ? (
        <span className="text-xs text-[var(--text-muted)]">@ {i.company}</span>
      ) : null}
      {i.track ? (
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
          {i.track.toLowerCase()}
        </span>
      ) : null}
      {i.at ? (
        <span className="text-xs text-[var(--text-secondary)]">{dueLabel(i.at, now)}</span>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <EntityStatusSelect
          endpoint="/api/career-items"
          id={i.id}
          status={i.status}
          options={ITEM_STATUSES}
        />
        <EntityDelete endpoint="/api/career-items" id={i.id} />
      </div>
    </li>
  );

  return (
    <div>
      <PageHeader
        title="Career"
        subtitle="Applications, interviews, networking, and the skills that get you there"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open applications" value={applications.length} />
        <Stat label="Interviews" value={interviews.length} />
        <Stat label="Events & networking" value={networking.length + careerEvents.length} />
        <Stat
          label="Skills in progress"
          value={skillsInProgress.length}
          hint={`${skills.length} tracked`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Applications & recruiting">
            {applications.length === 0 ? (
              <EmptyState title="No applications tracked" hint="Add insight programs, sophomore pipelines, and internships here." />
            ) : (
              <ul className="space-y-2">{applications.map(itemRow)}</ul>
            )}
            <div className="mt-3">
              <QuickAdd
                endpoint="/api/career-items"
                buttonLabel="Track an application"
                extra={{ kind: "APPLICATION" }}
                fields={[
                  { key: "title", placeholder: "Program / role", width: "min-w-48" },
                  { key: "company", placeholder: "Company" },
                  { key: "track", placeholder: "", type: "select", options: TRACKS },
                  { key: "at", placeholder: "", type: "date" },
                ]}
              />
            </div>
          </Card>

          <Card title="Interviews">
            {interviews.length === 0 ? (
              <EmptyState title="No interviews scheduled" />
            ) : (
              <ul className="space-y-2">{interviews.map(itemRow)}</ul>
            )}
            <div className="mt-3">
              <QuickAdd
                endpoint="/api/career-items"
                buttonLabel="Add an interview"
                extra={{ kind: "INTERVIEW", status: "SCHEDULED" }}
                fields={[
                  { key: "title", placeholder: "Interview (round, role)", width: "min-w-48" },
                  { key: "company", placeholder: "Company" },
                  { key: "at", placeholder: "", type: "date" },
                ]}
              />
            </div>
          </Card>

          <Card title="Skill matrix">
            <SkillMatrix skills={skillRows} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Upcoming career events">
            {careerEvents.length === 0 && networking.length === 0 ? (
              <EmptyState title="Nothing scheduled" hint="Career-category calendar events show here too." />
            ) : (
              <ul className="space-y-2">
                {careerEvents.map((e) => (
                  <li key={e.id}>
                    <div className="text-sm font-medium">{e.title}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {fmtDateTime(e.startAt)}
                      {e.location ? ` · ${e.location}` : ""}
                    </div>
                  </li>
                ))}
                {networking.map((i) => (
                  <li key={i.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{i.title}</div>
                      {i.at ? (
                        <div className="text-xs text-[var(--text-muted)]">{fmtDateTime(i.at)}</div>
                      ) : null}
                    </div>
                    <EntityDelete endpoint="/api/career-items" id={i.id} />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <QuickAdd
                endpoint="/api/career-items"
                buttonLabel="Add networking / event"
                extra={{ kind: "NETWORKING" }}
                fields={[
                  { key: "title", placeholder: "Coffee chat / event", width: "min-w-44" },
                  { key: "company", placeholder: "Company / person" },
                  { key: "at", placeholder: "", type: "date" },
                ]}
              />
            </div>
          </Card>

          <Card title="Recruiting timeline (first-year view)">
            <ul className="space-y-2.5">
              {TIMELINE.map((t) => (
                <li key={t.period}>
                  <div className="text-[13px] font-semibold">{t.period}</div>
                  <div className="text-xs text-[var(--text-secondary)]">{t.focus}</div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] italic text-[var(--text-muted)]">
              General guidance — verify each firm&apos;s actual timeline; finance
              early-ID dates in particular move earlier every cycle.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
