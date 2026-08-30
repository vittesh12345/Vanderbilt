"use client";

// The professional-development skill matrix: current → target level per skill
// with next action, resource, and deadline. Levels edit inline.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EntityDelete, QuickAdd } from "@/components/TrackerControls";

export interface SkillRow {
  id: string;
  name: string;
  category: string;
  currentLevel: number;
  targetLevel: number;
  nextAction: string | null;
  resource: string | null;
  timeRequired: string | null;
  deadline: string | null;
}

const CATEGORIES = ["FINANCE", "CONSULTING", "TECH", "STARTUP", "GENERAL"] as const;

function LevelDots({
  current,
  target,
  onSet,
}: {
  current: number;
  target: number;
  onSet: (level: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5" title={`Current ${current} → target ${target}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          onClick={() => onSet(i)}
          className="p-0.5"
          aria-label={`Set current level ${i}`}
        >
          <span
            className={
              i <= current
                ? "block h-2.5 w-2.5 rounded-full bg-[var(--gold-deep)]"
                : i <= target
                  ? "block h-2.5 w-2.5 rounded-full border-2 border-[var(--gold-deep)] bg-transparent"
                  : "block h-2.5 w-2.5 rounded-full bg-neutral-200"
            }
          />
        </button>
      ))}
    </div>
  );
}

export default function SkillMatrix({ skills }: { skills: SkillRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function patch(id: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/skills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const byCategory = CATEGORIES.map((c) => ({
    category: c,
    list: skills.filter((s) => s.category === c),
  })).filter((g) => g.list.length > 0);

  return (
    <div className="space-y-4">
      {byCategory.map((g) => (
        <div key={g.category}>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {g.category.toLowerCase()}
          </div>
          <div className="space-y-1.5">
            {g.list.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--border)] px-2.5 py-1.5"
              >
                <span className="min-w-32 text-[13px] font-medium">{s.name}</span>
                <LevelDots
                  current={s.currentLevel}
                  target={s.targetLevel}
                  onSet={(level) => !busy && patch(s.id, { currentLevel: level })}
                />
                <span className="text-[10px] text-[var(--text-muted)]">
                  {s.currentLevel}/{s.targetLevel} target
                </span>
                {s.nextAction ? (
                  <span className="text-xs text-[var(--text-secondary)]">
                    Next: {s.nextAction}
                  </span>
                ) : null}
                {s.resource ? (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    via {s.resource}
                  </span>
                ) : null}
                {s.timeRequired ? (
                  <span className="text-[10px] text-[var(--text-muted)]">{s.timeRequired}</span>
                ) : null}
                {s.deadline ? (
                  <span className="text-[10px] text-[var(--status-warning)]">
                    by {new Date(s.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                ) : null}
                <div className="ml-auto">
                  <EntityDelete endpoint="/api/skills" id={s.id} confirmText="Remove this skill?" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <QuickAdd
        endpoint="/api/skills"
        buttonLabel="Add skill"
        fields={[
          { key: "name", placeholder: "Skill (e.g. Financial modeling)", width: "min-w-48" },
          { key: "category", placeholder: "", type: "select", options: CATEGORIES },
          { key: "nextAction", placeholder: "Next action", width: "min-w-40" },
          { key: "resource", placeholder: "Resource" },
          { key: "deadline", placeholder: "", type: "date" },
        ]}
      />
    </div>
  );
}
