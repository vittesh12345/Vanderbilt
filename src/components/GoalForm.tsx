"use client";

// Collapsed "+ Add goal" button that expands into the goal creation form:
// category, title, description, tier (1–3), target date, and milestones
// (textarea, one per line). POSTs /api/goals then refreshes the page.
// Also exports GoalDelete, the small per-goal delete button.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EVENT_CATEGORIES } from "@/lib/types";

const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--gold-deep)]";
const labelCls =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";

export default function GoalForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("ACADEMIC");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState("2");
  const [targetDate, setTargetDate] = useState("");
  const [milestones, setMilestones] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Goal title is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          title: title.trim(),
          description: description.trim() || undefined,
          tier: Number(tier),
          targetDate: targetDate || undefined,
          milestones: milestones
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save the goal.");
        return;
      }
      setTitle("");
      setDescription("");
      setTier("2");
      setTargetDate("");
      setMilestones("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-dashed border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--gold-deep)] hover:text-[var(--gold-deep)]"
      >
        + Add goal
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="goal-title">Title *</label>
          <input
            id="goal-title"
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Land a sophomore-summer finance internship"
            required
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="goal-category">Category</label>
          <select
            id="goal-category"
            className={inputCls}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3">
          <label className={labelCls} htmlFor="goal-description">Description</label>
          <input
            id="goal-description"
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why this matters (optional)"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="goal-tier">Tier</label>
          <select
            id="goal-tier"
            className={inputCls}
            value={tier}
            onChange={(e) => setTier(e.target.value)}
          >
            <option value="1">Tier 1 — top priority</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="goal-target">Target date</label>
          <input
            id="goal-target"
            type="date"
            className={inputCls}
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
        <div className="sm:col-span-3">
          <label className={labelCls} htmlFor="goal-milestones">
            Milestones (one per line)
          </label>
          <textarea
            id="goal-milestones"
            className={`${inputCls} min-h-20`}
            value={milestones}
            onChange={(e) => setMilestones(e.target.value)}
            placeholder={"Polish resume\nApply to 10 programs\nMock interview"}
          />
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--black)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Create goal"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Small delete button for one goal (confirms, DELETEs, refreshes). */
export function GoalDelete({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Delete this goal and its milestones?")) return;
    setBusy(true);
    try {
      await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="shrink-0 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] hover:border-[var(--status-critical)] hover:text-[var(--status-critical)] disabled:opacity-50"
      aria-label="Delete goal"
    >
      ✕
    </button>
  );
}
