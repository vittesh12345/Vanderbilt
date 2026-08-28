"use client";

// Inline quick-add row for generic (non-course) tasks: title, category, due
// date, estimated minutes, importance → POST /api/tasks. Also exports the
// per-task row controls: TaskCheck (complete checkbox) and TaskDelete.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EVENT_CATEGORIES } from "@/lib/types";

const inputCls =
  "rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-xs outline-none focus:border-[var(--gold-deep)]";

export default function TaskQuickAdd() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("PERSONAL");
  const [due, setDue] = useState("");
  const [est, setEst] = useState("");
  const [importance, setImportance] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
          dueAt: due ? new Date(`${due}T23:59`).toISOString() : undefined,
          estMinutes: est ? Number(est) : undefined,
          importance: Number(importance),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not add the task.");
        return;
      }
      setTitle("");
      setCategory("PERSONAL");
      setDue("");
      setEst("");
      setImportance("3");
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5">
      <input
        className={`${inputCls} min-w-36 flex-1`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task…"
        aria-label="Task title"
      />
      <select
        className={`${inputCls} w-24`}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        aria-label="Task category"
      >
        {EVENT_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c.toLowerCase()}</option>
        ))}
      </select>
      <input
        type="date"
        className={`${inputCls} w-32`}
        value={due}
        onChange={(e) => setDue(e.target.value)}
        aria-label="Due date"
      />
      <input
        type="number"
        min={5}
        step={5}
        className={`${inputCls} w-16`}
        value={est}
        onChange={(e) => setEst(e.target.value)}
        placeholder="min"
        aria-label="Estimated minutes"
      />
      <select
        className={`${inputCls} w-14`}
        value={importance}
        onChange={(e) => setImportance(e.target.value)}
        aria-label="Importance (1–5)"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="rounded-md bg-[var(--black)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        Add
      </button>
      {error ? <p className="w-full text-xs text-red-700">{error}</p> : null}
    </form>
  );
}

/** Checkbox that marks a task COMPLETED (or back to NOT_STARTED). */
export function TaskCheck({
  taskId,
  completed = false,
}: {
  taskId: string;
  completed?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: completed ? "NOT_STARTED" : "COMPLETED" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <input
      type="checkbox"
      checked={completed}
      onChange={toggle}
      disabled={busy}
      className="h-4 w-4 accent-[var(--gold-deep)]"
      aria-label="Mark task complete"
    />
  );
}

/** Small delete button for one task. */
export function TaskDelete({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
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
      aria-label="Delete task"
    >
      ✕
    </button>
  );
}
