import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, PageHeader, SourceTag } from "@/components/ui";
import { ApplicationTracker, MembershipSelect, type AppRow } from "@/components/ClubControls";

export const dynamic = "force-dynamic";

export default async function ClubDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const club = await db.club.findUnique({
    where: { id },
    include: { applications: { orderBy: { createdAt: "desc" } } },
  });
  if (!club) notFound();

  const apps: AppRow[] = club.applications.map((a) => ({
    id: a.id,
    cycle: a.cycle,
    status: a.status,
    opensAt: a.opensAt?.toISOString() ?? null,
    deadlineAt: a.deadlineAt?.toISOString() ?? null,
    interviewAt: a.interviewAt?.toISOString() ?? null,
    notes: a.notes,
  }));

  const facts: { label: string; value: string | null }[] = [
    { label: "Meetings", value: club.meetingInfo },
    { label: "Recruitment", value: club.recruitment },
    { label: "Interview process", value: club.interviewProcess },
    { label: "Requirements", value: club.requirements },
    { label: "Leadership track", value: club.leadership },
    { label: "Contact", value: club.contact },
  ];

  return (
    <div>
      <PageHeader
        title={club.name}
        subtitle={`${club.category.replace(/_/g, "/").toLowerCase()} · ${club.membership.replace(/_/g, " ").toLowerCase()}`}
        action={
          <div className="flex items-center gap-2">
            <MembershipSelect clubId={club.id} membership={club.membership} />
            <Link
              href={`/clubs/${club.id}/edit`}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:border-[var(--gold-deep)]"
            >
              Edit
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="About">
            {club.description ? (
              <p className="text-sm text-[var(--text-secondary)]">{club.description}</p>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No description yet.</p>
            )}
            <dl className="mt-3 space-y-2">
              {facts
                .filter((f) => f.value)
                .map((f) => (
                  <div key={f.label}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {f.label}
                    </dt>
                    <dd className="text-sm">{f.value}</dd>
                  </div>
                ))}
            </dl>
          </Card>

          <Card title="Applications">
            <ApplicationTracker clubId={club.id} applications={apps} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Links & provenance">
            <div className="space-y-2 text-sm">
              {club.website ? (
                <a
                  href={club.website}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-[var(--gold-deep)] hover:underline"
                >
                  {club.website}
                </a>
              ) : null}
              {club.applicationUrl ? (
                <a
                  href={club.applicationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-[var(--gold-deep)] hover:underline"
                >
                  Application page
                </a>
              ) : null}
              <div className="flex items-center gap-2 pt-1">
                <SourceTag
                  source={club.confidence.toLowerCase()}
                  verifiedAt={club.lastVerifiedAt}
                />
              </div>
              {club.source ? (
                <p className="break-all text-[11px] text-[var(--text-muted)]">
                  Source: {club.source}
                </p>
              ) : null}
              <p className="text-[11px] text-[var(--text-muted)]">
                Club info goes stale — always confirm times and deadlines on the
                official page before acting.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
