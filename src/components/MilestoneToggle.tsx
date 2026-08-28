"use client";

// Checkbox for one milestone inside a goal's checklist. Toggling PATCHes
// /api/goals/[id] with the FULL updated milestones array plus the recomputed
// progress (done/total × 100, rounded) so the server state stays consistent.

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GoalMilestone } from "@/lib/types";

export default function MilestoneToggle({
  goalId,
  milestones,
  index,
}: {
  goalId: string;
  milestones: GoalMilestone[];
  index: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const milestone = milestones[index];

  async function toggle() {
    if (!milestone) return;
    setBusy(true);
    try {
      const updated = milestones.map((m, i) =>
        i === index
          ? {
              ...m,
              done: !m.done,
              date: !m.done ? new Date().toISOString() : m.date,
            }
          : m,
      );
      const done = updated.filter((m) => m.done).length;
      const progress =
        updated.length > 0 ? Math.round((done / updated.length) * 100) : 0;
      await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestones: updated, progress }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!milestone) return null;

  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
      <input
        type="checkbox"
        checked={milestone.done}
        onChange={toggle}
        disabled={busy}
        className="h-3.5 w-3.5 accent-[var(--gold-deep)]"
        aria-label={`Mark milestone "${milestone.title}" ${milestone.done ? "not done" : "done"}`}
      />
      <span className={milestone.done ? "line-through opacity-50" : ""}>
        {milestone.title}
      </span>
    </label>
  );
}
