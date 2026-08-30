// LONG-TERM — the semester arc and beyond: semester progress, tiered goals
// grouped by life category (with milestone checklists), and the open
// non-course task list with quick-add, complete, and delete.

import { db } from "@/lib/db";
import { getCurrentSemester, getOpenTasks } from "@/lib/data/queries";
import { parseJson } from "@/lib/json";
import { daysUntil, dueLabel, fmtDay, fmtMinutes } from "@/lib/dates";
import type { GoalMilestone } from "@/lib/types";
import { Card, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import GoalForm, { GoalDelete } from "@/components/GoalForm";
import MilestoneToggle from "@/components/MilestoneToggle";
import TaskQuickAdd, { TaskCheck, TaskDelete } from "@/components/TaskQuickAdd";

export const dynamic = "force-dynamic";

const GOAL_CATEGORY_ORDER: string[] = [
  "ACADEMIC",
  "STARTUP",
  "CAREER",
  "CLUB",
  "RESEARCH",
  "PERSONAL",
];

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

const TIER_STYLES: Record<number, string> = {
  1: "bg-[var(--gold)] text-[var(--black)] border-transparent",
  2: "bg-neutral-100 text-neutral-700 border-neutral-200",
  3: "bg-white text-neutral-500 border-neutral-200",
};

function TierBadge({ tier }: { tier: number }) {
  return (
    <span
      className={`inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${
        TIER_STYLES[tier] ?? TIER_STYLES[2]
      }`}
    >
      Tier {tier}
    </span>
  );
}

export default async function LongTermPage() {
  const now = new Date();
  const [semester, goals, tasks] = await Promise.all([
    getCurrentSemester(),
    db.goal.findMany({
      where: { status: { not: "DROPPED" } },
      orderBy: [{ tier: "asc" }, { createdAt: "asc" }],
    }),
    getOpenTasks(),
  ]);

  // Semester progress.
  let elapsedPct = 0;
  let weeksLeft = 0;
  if (semester) {
    const total = semester.endDate.getTime() - semester.startDate.getTime();
    if (total > 0) {
      elapsedPct = Math.min(
        100,
        Math.max(
          0,
          Math.round(((now.getTime() - semester.startDate.getTime()) / total) * 100),
        ),
      );
    }
    weeksLeft = Math.max(0, Math.ceil(daysUntil(semester.endDate, now) / 7));
  }

  // Goals grouped by category, in the fixed order (unknown categories last).
  const categories = [
    ...GOAL_CATEGORY_ORDER,
    ...goals
      .map((g) => g.category)
      .filter((c) => !GOAL_CATEGORY_ORDER.includes(c)),
  ];
  const groups = [...new Set(categories)]
    .map((cat) => ({ cat, items: goals.filter((g) => g.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <PageHeader
        title="Long-term"
        subtitle="Semester arc, tiered goals, and everything that isn't coursework"
      />

      {/* ---------------- Semester progress ---------------- */}
      <Card title="Semester" className="mb-6">
        {semester ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-lg font-bold">{semester.name}</div>
              <div className="text-xs text-[var(--text-secondary)]">
                {fmtDay(semester.startDate)} – {fmtDay(semester.endDate)}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <ProgressBar value={elapsedPct} />
              </div>
              <span className="shrink-0 text-xs font-semibold text-[var(--text-secondary)]">
                {elapsedPct}% elapsed
              </span>
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              {weeksLeft} week{weeksLeft === 1 ? "" : "s"} remaining
            </p>
          </>
        ) : (
          <EmptyState
            title="No semester configured"
            hint="Run the seed or create a semester to track progress."
          />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ---------------- Goals ---------------- */}
        <div className="lg:col-span-2">
          <Card
            title="Goals"
            action={
              <span className="text-xs text-[var(--text-muted)]">
                {goals.length} goal{goals.length === 1 ? "" : "s"}
              </span>
            }
          >
            <GoalForm />

            {groups.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No goals yet"
                  hint="Add a Tier-1 goal for the thing that matters most this year."
                />
              </div>
            ) : (
              <div className="mt-5 space-y-6">
                {groups.map(({ cat, items }) => (
                  <div key={cat}>
                    <div className="mb-2 flex items-center gap-2">
                      <CategoryChip category={cat} />
                      <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                        {items.length} goal{items.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {items.map((g) => {
                        const milestones = parseJson<GoalMilestone[]>(
                          g.milestonesJson,
                          [],
                        );
                        const targetDays = g.targetDate
                          ? daysUntil(g.targetDate, now)
                          : null;
                        return (
                          <div
                            key={g.id}
                            className="rounded-lg border border-[var(--border)] p-3"
                          >
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <TierBadge tier={g.tier} />
                                  <span className="text-sm font-semibold">
                                    {g.title}
                                  </span>
                                  {g.status === "ACHIEVED" ? (
                                    <span className="inline-block rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                      Achieved
                                    </span>
                                  ) : null}
                                </div>
                                {g.description ? (
                                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                    {g.description}
                                  </p>
                                ) : null}
                              </div>
                              <GoalDelete goalId={g.id} />
                            </div>

                            <div className="mt-2.5 flex items-center gap-3">
                              <div className="flex-1">
                                <ProgressBar value={g.progress} />
                              </div>
                              <span className="w-9 shrink-0 text-right text-xs font-semibold text-[var(--text-secondary)]">
                                {g.progress}%
                              </span>
                            </div>

                            {g.targetDate ? (
                              <p className="mt-1 text-xs text-[var(--text-muted)]">
                                Target: {fmtDay(g.targetDate)}
                                {targetDays === 0
                                  ? " · today"
                                  : targetDays !== null && targetDays > 0
                                    ? ` · in ${targetDays} day${targetDays === 1 ? "" : "s"}`
                                    : targetDays !== null
                                      ? ` · ${-targetDays}d past`
                                      : ""}
                              </p>
                            ) : null}

                            {milestones.length > 0 ? (
                              <ul className="mt-2.5 space-y-1">
                                {milestones.map((_, i) => (
                                  <li key={i}>
                                    <MilestoneToggle
                                      goalId={g.id}
                                      milestones={milestones}
                                      index={i}
                                    />
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ---------------- Open tasks ---------------- */}
        <div>
          <Card
            title="Open tasks"
            action={
              <span className="text-xs text-[var(--text-muted)]">
                {tasks.length} open
              </span>
            }
          >
            <TaskQuickAdd />

            {tasks.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="No open tasks"
                  hint="Add career, club, or personal to-dos above."
                />
              </div>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2.5">
                    <div className="mt-0.5">
                      <TaskCheck taskId={t.id} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{t.title}</span>
                        <CategoryChip category={t.category} />
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {t.dueAt ? `${dueLabel(t.dueAt, now)} · ` : ""}
                        {t.estMinutes ? `~${fmtMinutes(t.estMinutes)} · ` : ""}
                        importance {t.importance}/5
                      </div>
                    </div>
                    <TaskDelete taskId={t.id} />
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
