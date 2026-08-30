"use client";

// Create/edit form for a course: scalar fields plus dynamic row editors for
// weekly meetings, grade weights, office hours, and important links.
// POSTs /api/courses on create, PATCHes /api/courses/[id] on edit, then
// navigates to the course profile. Edit mode also carries the Delete button.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DAY_NAMES, parseHM } from "@/lib/dates";
import type { CourseLink, GradeWeight, OfficeHour } from "@/lib/types";

const MEETING_KINDS = ["LECTURE", "LAB", "DISCUSSION", "SEMINAR"] as const;
const LINK_KINDS = ["LMS", "EXTERNAL", "GITHUB", "DOC", "OTHER"] as const;

export interface MeetingInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  kind: string;
  location?: string | null;
}

export interface CourseFormInitial {
  code: string;
  title: string;
  professor: string;
  professorEmail: string;
  location: string;
  credits: number;
  difficulty: number;
  targetGrade: string;
  notes: string;
  meetings: MeetingInput[];
  gradeWeights: GradeWeight[];
  officeHours: OfficeHour[];
  links: CourseLink[];
}

interface MeetingRow {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  kind: string;
  location: string;
}
interface WeightRow {
  category: string;
  weight: string;
}
interface OfficeHourRow {
  day: string;
  start: string;
  end: string;
  location: string;
  note: string; // not edited here, but round-tripped so edits don't erase it
}
interface LinkRow {
  label: string;
  url: string;
  kind: string;
  authRequired: boolean;
  notes: string; // round-tripped, not edited here
}

const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--gold-deep)]";
const labelCls =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";
const rowBtnCls =
  "shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--status-critical)] hover:text-[var(--status-critical)]";
const addBtnCls =
  "mt-2 rounded-md border border-dashed border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--gold-deep)] hover:text-[var(--gold-deep)]";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
      {children}
    </h3>
  );
}

export default function CourseForm({
  courseId,
  initial,
}: {
  /** When set, the form edits an existing course; otherwise it creates one. */
  courseId?: string;
  initial?: CourseFormInitial;
}) {
  const router = useRouter();
  const editing = Boolean(courseId);

  const [code, setCode] = useState(initial?.code ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [professor, setProfessor] = useState(initial?.professor ?? "");
  const [professorEmail, setProfessorEmail] = useState(initial?.professorEmail ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [credits, setCredits] = useState(String(initial?.credits ?? 3));
  const [difficulty, setDifficulty] = useState(String(initial?.difficulty ?? 3));
  const [targetGrade, setTargetGrade] = useState(initial?.targetGrade ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [meetings, setMeetings] = useState<MeetingRow[]>(
    (initial?.meetings ?? []).map((m) => ({
      dayOfWeek: String(m.dayOfWeek),
      startTime: m.startTime,
      endTime: m.endTime,
      kind: m.kind,
      location: m.location ?? "",
    })),
  );
  const [weights, setWeights] = useState<WeightRow[]>(
    (initial?.gradeWeights ?? []).map((w) => ({
      category: w.category,
      weight: String(w.weight),
    })),
  );
  const [officeHours, setOfficeHours] = useState<OfficeHourRow[]>(
    (initial?.officeHours ?? []).map((o) => ({
      day: o.day,
      start: o.start,
      end: o.end,
      location: o.location ?? "",
      note: o.note ?? "",
    })),
  );
  const [links, setLinks] = useState<LinkRow[]>(
    (initial?.links ?? []).map((l) => ({
      label: l.label,
      url: l.url,
      kind: l.kind,
      authRequired: Boolean(l.authRequired),
      notes: l.notes ?? "",
    })),
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow<T>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    index: number,
    patch: Partial<T>,
  ) {
    setter((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeRow<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, index: number) {
    setter((rows) => rows.filter((_, i) => i !== index));
  }

  function buildPayload() {
    return {
      code: code.trim(),
      title: title.trim(),
      professor: professor.trim(),
      professorEmail: professorEmail.trim(),
      location: location.trim(),
      credits: Number(credits) || 3,
      difficulty: Math.min(5, Math.max(1, Math.round(Number(difficulty) || 3))),
      targetGrade: targetGrade.trim(),
      notes: notes.trim(),
      meetings: meetings
        .filter((m) => m.startTime.trim() && m.endTime.trim())
        .map((m) => ({
          dayOfWeek: Number(m.dayOfWeek),
          startTime: m.startTime.trim(),
          endTime: m.endTime.trim(),
          kind: m.kind,
          location: m.location.trim() || undefined,
        })),
      gradeWeights: weights
        .filter((w) => w.category.trim() && Number(w.weight) > 0)
        .map((w) => ({ category: w.category.trim(), weight: Number(w.weight) })),
      officeHours: officeHours
        .filter((o) => o.start.trim() && o.end.trim())
        .map((o) => ({
          day: o.day,
          start: o.start.trim(),
          end: o.end.trim(),
          location: o.location.trim() || undefined,
          note: o.note.trim() || undefined,
        })),
      links: links
        .filter((l) => l.url.trim())
        .map((l) => ({
          label: l.label.trim() || l.url.trim(),
          url: l.url.trim(),
          kind: l.kind,
          authRequired: l.authRequired,
          notes: l.notes.trim() || undefined,
        })),
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!code.trim() || !title.trim()) {
      setError("Course code and title are required.");
      return;
    }
    for (const m of meetings) {
      if (!m.startTime.trim() && !m.endTime.trim()) continue; // blank row, dropped
      if (parseHM(m.startTime) == null || parseHM(m.endTime) == null) {
        setError('Meeting times must be 24-hour HH:MM (e.g. "10:10"\u2013"11:00").');
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/courses/${courseId}` : "/api/courses", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong saving the course.");
        return;
      }
      const course = await res.json();
      router.push(`/courses/${editing ? courseId : course.id}`);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCourse() {
    if (!courseId) return;
    if (!window.confirm("Delete this course and everything attached to it?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not delete the course.");
        return;
      }
      router.push("/courses");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-3xl">
      {/* ---------------- Scalars ---------------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="course-code">Code *</label>
          <input
            id="course-code"
            className={inputCls}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CS 2201"
            required
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="course-title">Title *</label>
          <input
            id="course-title"
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Data Structures"
            required
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="course-prof">Professor</label>
          <input
            id="course-prof"
            className={inputCls}
            value={professor}
            onChange={(e) => setProfessor(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="course-prof-email">Professor email</label>
          <input
            id="course-prof-email"
            type="email"
            className={inputCls}
            value={professorEmail}
            onChange={(e) => setProfessorEmail(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="course-location">Location</label>
          <input
            id="course-location"
            className={inputCls}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Featheringill 134"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls} htmlFor="course-credits">Credits</label>
            <input
              id="course-credits"
              type="number"
              min={0.5}
              step={0.5}
              className={inputCls}
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="course-difficulty">Difficulty</label>
            <select
              id="course-difficulty"
              className={inputCls}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="course-target">Target</label>
            <input
              id="course-target"
              className={inputCls}
              value={targetGrade}
              onChange={(e) => setTargetGrade(e.target.value)}
              placeholder="A"
            />
          </div>
        </div>
      </div>

      {/* ---------------- Meetings ---------------- */}
      <SectionHeading>Weekly meetings</SectionHeading>
      <div className="space-y-2">
        {meetings.map((m, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              className={`${inputCls} w-24`}
              value={m.dayOfWeek}
              onChange={(e) => updateRow(setMeetings, i, { dayOfWeek: e.target.value })}
              aria-label="Day of week"
            >
              {DAY_NAMES.map((d, di) => (
                <option key={d} value={di}>{d}</option>
              ))}
            </select>
            <input
              className={`${inputCls} w-24`}
              value={m.startTime}
              onChange={(e) => updateRow(setMeetings, i, { startTime: e.target.value })}
              placeholder="10:10"
              aria-label="Start time (24h HH:MM)"
            />
            <span className="text-xs text-[var(--text-muted)]">–</span>
            <input
              className={`${inputCls} w-24`}
              value={m.endTime}
              onChange={(e) => updateRow(setMeetings, i, { endTime: e.target.value })}
              placeholder="11:00"
              aria-label="End time (24h HH:MM)"
            />
            <select
              className={`${inputCls} w-32`}
              value={m.kind}
              onChange={(e) => updateRow(setMeetings, i, { kind: e.target.value })}
              aria-label="Meeting kind"
            >
              {MEETING_KINDS.map((k) => (
                <option key={k} value={k}>{k.toLowerCase()}</option>
              ))}
            </select>
            <input
              className={`${inputCls} w-36 flex-1`}
              value={m.location}
              onChange={(e) => updateRow(setMeetings, i, { location: e.target.value })}
              placeholder="Location (optional)"
              aria-label="Meeting location"
            />
            <button type="button" className={rowBtnCls} onClick={() => removeRow(setMeetings, i)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={addBtnCls}
        onClick={() =>
          setMeetings((rows) => [
            ...rows,
            { dayOfWeek: "1", startTime: "", endTime: "", kind: "LECTURE", location: "" },
          ])
        }
      >
        + Add meeting
      </button>

      {/* ---------------- Grade weights ---------------- */}
      <SectionHeading>Grade weighting</SectionHeading>
      <div className="space-y-2">
        {weights.map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className={`${inputCls} flex-1`}
              value={w.category}
              onChange={(e) => updateRow(setWeights, i, { category: e.target.value })}
              placeholder="Exams"
              aria-label="Grade category"
            />
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              className={`${inputCls} w-24`}
              value={w.weight}
              onChange={(e) => updateRow(setWeights, i, { weight: e.target.value })}
              placeholder="40"
              aria-label="Weight percent"
            />
            <span className="text-xs text-[var(--text-muted)]">%</span>
            <button type="button" className={rowBtnCls} onClick={() => removeRow(setWeights, i)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={addBtnCls}
        onClick={() => setWeights((rows) => [...rows, { category: "", weight: "" }])}
      >
        + Add category
      </button>

      {/* ---------------- Office hours ---------------- */}
      <SectionHeading>Office hours</SectionHeading>
      <div className="space-y-2">
        {officeHours.map((o, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              className={`${inputCls} w-24`}
              value={o.day}
              onChange={(e) => updateRow(setOfficeHours, i, { day: e.target.value })}
              aria-label="Office hours day"
            >
              {DAY_NAMES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <input
              className={`${inputCls} w-24`}
              value={o.start}
              onChange={(e) => updateRow(setOfficeHours, i, { start: e.target.value })}
              placeholder="14:00"
              aria-label="Office hours start (24h HH:MM)"
            />
            <span className="text-xs text-[var(--text-muted)]">–</span>
            <input
              className={`${inputCls} w-24`}
              value={o.end}
              onChange={(e) => updateRow(setOfficeHours, i, { end: e.target.value })}
              placeholder="15:30"
              aria-label="Office hours end (24h HH:MM)"
            />
            <input
              className={`${inputCls} w-36 flex-1`}
              value={o.location}
              onChange={(e) => updateRow(setOfficeHours, i, { location: e.target.value })}
              placeholder="Location (optional)"
              aria-label="Office hours location"
            />
            <button type="button" className={rowBtnCls} onClick={() => removeRow(setOfficeHours, i)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={addBtnCls}
        onClick={() =>
          setOfficeHours((rows) => [...rows, { day: "Tue", start: "", end: "", location: "", note: "" }])
        }
      >
        + Add office hours
      </button>

      {/* ---------------- Links ---------------- */}
      <SectionHeading>Important links</SectionHeading>
      <div className="space-y-2">
        {links.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              className={`${inputCls} w-36`}
              value={l.label}
              onChange={(e) => updateRow(setLinks, i, { label: e.target.value })}
              placeholder="Brightspace"
              aria-label="Link label"
            />
            <input
              className={`${inputCls} w-48 flex-1`}
              value={l.url}
              onChange={(e) => updateRow(setLinks, i, { url: e.target.value })}
              placeholder="https://…"
              aria-label="Link URL"
            />
            <select
              className={`${inputCls} w-28`}
              value={l.kind}
              onChange={(e) => updateRow(setLinks, i, { kind: e.target.value })}
              aria-label="Link kind"
            >
              {LINK_KINDS.map((k) => (
                <option key={k} value={k}>{k.toLowerCase()}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={l.authRequired}
                onChange={(e) => updateRow(setLinks, i, { authRequired: e.target.checked })}
                className="h-3.5 w-3.5 accent-[var(--gold-deep)]"
              />
              login required
            </label>
            <button type="button" className={rowBtnCls} onClick={() => removeRow(setLinks, i)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={addBtnCls}
        onClick={() =>
          setLinks((rows) => [...rows, { label: "", url: "", kind: "LMS", authRequired: false, notes: "" }])
        }
      >
        + Add link
      </button>

      {/* ---------------- Notes ---------------- */}
      <SectionHeading>Notes</SectionHeading>
      <textarea
        className={`${inputCls} min-h-20`}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Anything worth remembering about this course…"
        aria-label="Course notes"
      />

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--black)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : editing ? "Save changes" : "Create course"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-0)]"
        >
          Cancel
        </button>
        {editing ? (
          <button
            type="button"
            onClick={deleteCourse}
            disabled={busy}
            className="ml-auto rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Delete course
          </button>
        ) : null}
      </div>
    </form>
  );
}
