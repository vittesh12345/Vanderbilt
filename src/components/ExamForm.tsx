"use client";

// Create/edit form for exams & quizzes. POSTs to /api/exams (create) or
// PATCHes /api/exams/[id] (edit). Topics are entered one per line and stored
// as a string[] in topicsJson server-side.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EXAM_KINDS } from "@/lib/types";

export interface CourseChoice {
  id: string;
  code: string;
  title: string;
}

/** JSON-safe initial values for edit mode (dates as ISO strings). */
export interface ExamInitial {
  id: string;
  courseId: string;
  title: string;
  kind: string;
  startAt: string; // ISO
  endAt: string | null; // ISO
  location: string;
  weight: number | null;
  topicsText: string; // one topic per line
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

const labelCls =
  "block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";
const inputCls =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm focus:border-[var(--gold-deep)] focus:outline-none";

export default function ExamForm({
  courses,
  initial,
}: {
  courses: CourseChoice[];
  initial?: ExamInitial;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const start = splitLocal(initial?.startAt ?? null);
  const end = splitLocal(initial?.endAt ?? null);

  const [courseId, setCourseId] = useState(initial?.courseId ?? courses[0]?.id ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "MIDTERM");
  const [date, setDate] = useState(start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endTime, setEndTime] = useState(end.time);
  const [location, setLocation] = useState(initial?.location ?? "");
  const [weight, setWeight] = useState(
    initial?.weight != null ? String(initial.weight) : "",
  );
  const [topicsText, setTopicsText] = useState(initial?.topicsText ?? "");
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
      setError("Give the exam a title.");
      return;
    }
    if (!date) {
      setError("Set the exam date.");
      return;
    }

    const startAt = new Date(`${date}T${startTime || "09:00"}`);
    if (isNaN(startAt.getTime())) {
      setError("Invalid date/time.");
      return;
    }
    const endAt = endTime ? new Date(`${date}T${endTime}`) : null;

    const weightNum =
      weight.trim() === "" ? null : Number.isFinite(Number(weight)) ? Number(weight) : null;

    const topics = topicsText
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      courseId,
      title: title.trim(),
      kind,
      startAt: startAt.toISOString(),
      endAt: endAt && !isNaN(endAt.getTime()) ? endAt.toISOString() : null,
      location: location.trim() || null,
      weight: weightNum,
      topics,
      notes: notes.trim() || null,
    };

    setBusy(true);
    try {
      const res = await fetch(
        editing ? `/api/exams/${initial!.id}` : "/api/exams",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Something went wrong saving the exam.");
        return;
      }
      router.push(editing ? `/exams/${initial!.id}` : "/exams");
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
          <label className={labelCls} htmlFor="ef-course">Course</label>
          <select
            id="ef-course"
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
          <label className={labelCls} htmlFor="ef-kind">Kind</label>
          <select
            id="ef-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={inputCls}
          >
            {EXAM_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="ef-title">Title</label>
          <input
            id="ef-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Midterm 1"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="ef-date">Date</label>
          <input
            id="ef-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <label className={labelCls} htmlFor="ef-start">Start time</label>
              <input
                id="ef-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex-1">
              <label className={labelCls} htmlFor="ef-end">End time</label>
              <input
                id="ef-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            End time optional. Blank start defaults to 9:00 AM.
          </p>
        </div>

        <div>
          <label className={labelCls} htmlFor="ef-location">Location</label>
          <input
            id="ef-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Featheringill 134"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="ef-weight">Weight % of final grade</label>
          <input
            id="ef-weight"
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="e.g. 20"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="ef-topics">Topics in scope — one per line</label>
          <textarea
            id="ef-topics"
            value={topicsText}
            onChange={(e) => setTopicsText(e.target.value)}
            rows={5}
            placeholder={"Lectures 1–6\nCh. 3 recursion\nLinked lists"}
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            The study planner splits these across sessions and flags weak topics.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="ef-notes">Notes</label>
          <textarea
            id="ef-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Allowed materials, format, professor hints…"
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
          {busy ? "Saving…" : editing ? "Save changes" : "Create exam"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/exams")}
          className="text-sm font-medium text-[var(--text-secondary)] hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
