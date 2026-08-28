"use client";

// Create/edit form for assignments. POSTs to /api/assignments (create) or
// PATCHes /api/assignments/[id] (edit). Estimates may be left blank on create —
// the API auto-estimates from kind × difficulty, calibrated by history.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ASSIGNMENT_KINDS, ASSIGNMENT_STATUSES } from "@/lib/types";

export interface CourseChoice {
  id: string;
  code: string;
  title: string;
}

/** JSON-safe initial values for edit mode (dates as ISO strings). */
export interface AssignmentInitial {
  id: string;
  courseId: string;
  title: string;
  kind: string;
  description: string;
  dueAt: string | null; // ISO
  difficulty: number;
  importance: number;
  gradeWeight: number | null;
  estMinutes: number | null;
  estMinutesMax: number | null;
  status: string;
  notes: string;
}

function splitLocal(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

const SCALE = [1, 2, 3, 4, 5];

const labelCls =
  "block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";
const inputCls =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm focus:border-[var(--gold-deep)] focus:outline-none";

export default function AssignmentForm({
  courses,
  initial,
}: {
  courses: CourseChoice[];
  initial?: AssignmentInitial;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const split = splitLocal(initial?.dueAt ?? null);

  const [courseId, setCourseId] = useState(initial?.courseId ?? courses[0]?.id ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "HOMEWORK");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueDate, setDueDate] = useState(split.date);
  const [dueTime, setDueTime] = useState(split.time);
  const [difficulty, setDifficulty] = useState(String(initial?.difficulty ?? 3));
  const [importance, setImportance] = useState(String(initial?.importance ?? 3));
  const [gradeWeight, setGradeWeight] = useState(
    initial?.gradeWeight != null ? String(initial.gradeWeight) : "",
  );
  const [estMinutes, setEstMinutes] = useState(
    initial?.estMinutes != null ? String(initial.estMinutes) : "",
  );
  const [estMinutesMax, setEstMinutesMax] = useState(
    initial?.estMinutesMax != null ? String(initial.estMinutesMax) : "",
  );
  const [status, setStatus] = useState(initial?.status ?? "NOT_STARTED");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!courseId) {
      setError("Pick a course.");
      return;
    }
    if (!title.trim()) {
      setError("Give the assignment a title.");
      return;
    }
    const num = (raw: string): number | null => {
      if (raw.trim() === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    const dueAt = dueDate
      ? new Date(`${dueDate}T${dueTime || "23:59"}`).toISOString()
      : null;

    const payload: Record<string, unknown> = {
      courseId,
      title: title.trim(),
      kind,
      description: description.trim() || null,
      dueAt,
      difficulty: Number(difficulty),
      importance: Number(importance),
      gradeWeight: num(gradeWeight),
      estMinutes: num(estMinutes),
      estMinutesMax: num(estMinutesMax),
      notes: notes.trim() || null,
    };
    if (editing) payload.status = status;

    setBusy(true);
    try {
      const res = await fetch(
        editing ? `/api/assignments/${initial!.id}` : "/api/assignments",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Something went wrong saving the assignment.");
        return;
      }
      router.push("/assignments");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="af-course">Course</label>
          <select
            id="af-course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className={inputCls}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="af-kind">Kind</label>
          <select
            id="af-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={inputCls}
          >
            {ASSIGNMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="af-title">Title</label>
          <input
            id="af-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Problem Set 4"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="af-desc">Description</label>
          <textarea
            id="af-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What the assignment covers, requirements, rubric notes…"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="af-due-date">Due date</label>
          <input
            id="af-due-date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="af-due-time">Due time</label>
          <input
            id="af-due-time"
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Blank time defaults to 11:59 PM.
          </p>
        </div>

        <div>
          <label className={labelCls} htmlFor="af-difficulty">Difficulty (1–5)</label>
          <select
            id="af-difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className={inputCls}
          >
            {SCALE.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="af-importance">Importance (1–5)</label>
          <select
            id="af-importance"
            value={importance}
            onChange={(e) => setImportance(e.target.value)}
            className={inputCls}
          >
            {SCALE.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="af-weight">Grade weight %</label>
          <input
            id="af-weight"
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={gradeWeight}
            onChange={(e) => setGradeWeight(e.target.value)}
            placeholder="e.g. 5"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="af-est">Estimated minutes</label>
          <div className="flex items-center gap-2">
            <input
              id="af-est"
              type="number"
              min={5}
              value={estMinutes}
              onChange={(e) => setEstMinutes(e.target.value)}
              placeholder="est"
              className={inputCls}
              aria-label="Estimated minutes"
            />
            <span className="mt-1 text-[var(--text-muted)]">–</span>
            <input
              type="number"
              min={5}
              value={estMinutesMax}
              onChange={(e) => setEstMinutesMax(e.target.value)}
              placeholder="max"
              className={inputCls}
              aria-label="Estimated minutes upper bound"
            />
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Leave blank to auto-estimate from kind × difficulty, calibrated by your history.
          </p>
        </div>

        {editing ? (
          <div>
            <label className={labelCls} htmlFor="af-status">Status</label>
            <select
              id="af-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputCls}
            >
              {ASSIGNMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="af-notes">Notes</label>
          <textarea
            id="af-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything future-you should know."
            className={inputCls}
          />
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm font-medium text-[var(--status-critical)]">{error}</p>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--gold-deep)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : editing ? "Save changes" : "Create assignment"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/assignments")}
          className="text-sm font-medium text-[var(--text-secondary)] hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
