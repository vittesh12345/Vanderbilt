// CLUBS — Vanderbilt club intelligence: the club database ranked against the
// student's own interests/tiers/goals (HIGH/MEDIUM/LOW, each with a WHY), the
// application pipeline, and provenance on every record (source, confidence,
// last verified) because club info goes stale fast.

import Link from "next/link";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { dueLabel } from "@/lib/dates";
import { rankClubs } from "@/lib/engine/clubrank";
import { getActiveClubApplications, getProfile } from "@/lib/data/queries";
import { Card, EmptyState, PageHeader, SourceTag } from "@/components/ui";
import { ApplicationTracker, MembershipSelect, type AppRow } from "@/components/ClubControls";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  FINANCE: "Finance",
  CONSULTING: "Consulting",
  TECH: "Tech",
  ENTREPRENEURSHIP: "Entrepreneurship",
  AI: "AI",
  BUSINESS: "Business",
  VC_PE: "VC / PE",
  PRODUCT: "Product",
  OTHER: "Other",
};

function toAppRows(
  apps: {
    id: string;
    cycle: string | null;
    status: string;
    opensAt: Date | null;
    deadlineAt: Date | null;
    interviewAt: Date | null;
    notes: string | null;
  }[],
): AppRow[] {
  return apps.map((a) => ({
    id: a.id,
    cycle: a.cycle,
    status: a.status,
    opensAt: a.opensAt?.toISOString() ?? null,
    deadlineAt: a.deadlineAt?.toISOString() ?? null,
    interviewAt: a.interviewAt?.toISOString() ?? null,
    notes: a.notes,
  }));
}

export default async function ClubsPage() {
  const now = new Date();
  const [clubs, activeApps, { profile, tiers }, goals] = await Promise.all([
    db.club.findMany({
      include: { applications: { orderBy: { createdAt: "desc" } } },
      orderBy: { name: "asc" },
    }),
    getActiveClubApplications(),
    getProfile(),
    db.goal.findMany({ where: { status: "ACTIVE" } }),
  ]);

  const rankings = rankClubs(
    clubs.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      description: c.description,
      membership: c.membership,
    })),
    {
      interests: parseJson<string[]>(profile?.interestsJson ?? "[]", []),
      tier1: tiers.tier1,
      tier2: tiers.tier2,
      goals: goals.map((g) => ({ category: g.category, title: g.title })),
    },
  );

  const joined = clubs.filter((c) => ["MEMBER", "LEADER"].includes(c.membership));
  const prospects = clubs.filter((c) => !["MEMBER", "LEADER"].includes(c.membership));
  const byPriority = (p: string) =>
    prospects
      .filter((c) => (rankings.get(c.id)?.priority ?? "LOW") === p)
      .sort((a, b) => (rankings.get(b.id)?.score ?? 0) - (rankings.get(a.id)?.score ?? 0));

  const groups: { label: string; blurb: string; list: typeof clubs }[] = [
    { label: "High priority", blurb: "Seriously pursue these.", list: byPriority("HIGH") },
    { label: "Medium priority", blurb: "Useful, less critical right now.", list: byPriority("MEDIUM") },
    { label: "Lower priority", blurb: "Interesting, not worth prioritizing yet.", list: byPriority("LOW") },
  ];

  const upcomingApps = activeApps.filter((a) => a.deadlineAt && a.deadlineAt >= now);

  return (
    <div>
      <PageHeader
        title="Clubs"
        subtitle="Ranked against your interests, priority tiers, and goals — with the reason, not just the rank"
        action={
          <Link
            href="/clubs/new"
            className="rounded-md bg-[var(--black)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Add club
          </Link>
        }
      />

      {upcomingApps.length > 0 && (
        <Card title="Application pipeline" className="mb-6">
          <ul className="space-y-1.5">
            {upcomingApps.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{a.club.name}</span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold">
                  {a.status.replace(/_/g, " ").toLowerCase()}
                </span>
                {a.deadlineAt ? (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {dueLabel(a.deadlineAt, now)}
                  </span>
                ) : null}
                {a.interviewAt && a.status === "INTERVIEW" ? (
                  <span className="text-xs text-[var(--status-warning)]">
                    interview {a.interviewAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {joined.length > 0 && (
        <Card title="Joined" className="mb-6">
          <div className="space-y-3">
            {joined.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <Link href={`/clubs/${c.id}`} className="text-sm font-semibold hover:underline">
                  {c.name}
                </Link>
                <span className="text-xs text-[var(--text-muted)]">
                  {CATEGORY_LABELS[c.category] ?? c.category}
                  {c.meetingInfo ? ` · ${c.meetingInfo}` : ""}
                </span>
                <div className="ml-auto">
                  <MembershipSelect clubId={c.id} membership={c.membership} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {clubs.length === 0 ? (
        <EmptyState
          title="No clubs tracked yet"
          hint="Run the seed (npm run seed:clubs) for a researched Vanderbilt starter set, or add clubs manually."
        />
      ) : (
        groups.map((g) =>
          g.list.length === 0 ? null : (
            <Card key={g.label} title={g.label} className="mb-6">
              <p className="mb-3 text-xs text-[var(--text-muted)]">{g.blurb}</p>
              <div className="space-y-4">
                {g.list.map((c) => {
                  const r = rankings.get(c.id);
                  return (
                    <div key={c.id} className="rounded-lg border border-[var(--border)] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/clubs/${c.id}`} className="text-sm font-bold hover:underline">
                          {c.name}
                        </Link>
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                          {CATEGORY_LABELS[c.category] ?? c.category}
                        </span>
                        <SourceTag
                          source={c.confidence === "VERIFIED" ? "verified" : c.confidence.toLowerCase()}
                          verifiedAt={c.lastVerifiedAt}
                        />
                        <div className="ml-auto">
                          <MembershipSelect clubId={c.id} membership={c.membership} />
                        </div>
                      </div>
                      {c.description ? (
                        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{c.description}</p>
                      ) : null}
                      <p className="mt-1 text-xs">
                        <span className="font-semibold text-[var(--gold-deep)]">Why: </span>
                        <span className="text-[var(--text-secondary)]">{r?.reason}</span>
                      </p>
                      {c.recruitment ? (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Recruitment: {c.recruitment}
                        </p>
                      ) : null}
                      <div className="mt-2">
                        <ApplicationTracker clubId={c.id} applications={toAppRows(c.applications)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ),
        )
      )}
    </div>
  );
}
