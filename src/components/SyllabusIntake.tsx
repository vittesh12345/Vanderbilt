"use client";

// Syllabus intake — a three-step client flow:
//   1. Paste: pick a course, paste raw syllabus text → POST /api/syllabus/parse
//   2. Review: check exactly what will be written (course info diffs, grade
//      weights, dated items with editable title/kind/date/time, office hours,
//      materials); policies/objectives are informational only.
//   3. Commit: POST selections to /api/syllabus/commit → summary + reset.
//
// Also exports ConflictCard + ConflictResolve, used by the syllabus page to
// surface OPEN Conflict rows (and reused for step-2 informational conflicts).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, EmptyState } from "@/components/ui";
import type {
  Confidence,
  ExtractedDate,
  SyllabusExtraction,
} from "@/lib/types";
import type { ConflictCandidate } from "@/lib/conflicts";

// ---------------------------------------------------------------------------
// Shared conflict card (page + step 2 use the same look)
// ---------------------------------------------------------------------------

export function ConflictResolve({ conflictId }: { conflictId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    try {
      await fetch(`/api/conflicts/${conflictId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: note.trim() || "Resolved manually" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--gold-deep)] hover:text-[var(--gold-deep)]"
      >
        Resolve
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <input
        className="w-44 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--gold-deep)]"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="How was this resolved?"
        aria-label="Resolution note"
      />
      <button
        type="button"
        onClick={resolve}
        disabled={busy}
        className="rounded-md bg-[var(--black)] px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-0)]"
      >
        Cancel
      </button>
    </div>
  );
}

export function ConflictCard({
  description,
  sourceA,
  valueA,
  sourceB,
  valueB,
  suggestion,
  conflictId,
}: {
  description: string;
  sourceA: string;
  valueA: string;
  sourceB: string;
  valueB: string;
  suggestion?: string | null;
  /** When set, the card carries a Resolve button that PATCHes the Conflict row. */
  conflictId?: string;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-xs font-bold tracking-wide text-red-700">
          ⚠️ CONFLICT DETECTED
        </div>
        {conflictId ? <ConflictResolve conflictId={conflictId} /> : null}
      </div>
      <p className="mt-1 text-sm font-semibold">{description}</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-[var(--border)] bg-white px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {sourceA}
          </div>
          <div className="text-sm font-semibold">{valueA}</div>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-white px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {sourceB}
          </div>
          <div className="text-sm font-semibold">{valueB}</div>
        </div>
      </div>
      {suggestion ? (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">{suggestion}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intake flow
// ---------------------------------------------------------------------------

export interface IntakeCourse {
  id: string;
  code: string;
  title: string;
  color: string;
  professor: string | null;
  professorEmail: string | null;
  location: string | null;
  credits: number;
}

interface ParseResponse {
  uploadId: string;
  extraction: SyllabusExtraction;
  conflicts: ConflictCandidate[];
  aiUsed: boolean;
}

interface CommitResult {
  assignments: number;
  exams: number;
  conflictsCreated: number;
  courseUpdated: boolean;
}

interface InfoRow {
  key: string;
  label: string;
  current: string;
  extracted: string;
  value: string | number;
  selected: boolean;
}
interface WeightRow {
  selected: boolean;
  category: string;
  weight: number;
  confidence: Confidence;
}
interface DateRow {
  selected: boolean;
  title: string;
  kind: ExtractedDate["kind"];
  date: string; // YYYY-MM-DD
  time: string; // "" or HH:MM
  details?: string;
  confidence: Confidence;
  sourceLine?: string;
}
interface OfficeRow {
  selected: boolean;
  day: string;
  start: string;
  end: string;
  location?: string;
  note?: string;
  confidence: Confidence;
}
interface MaterialRow {
  selected: boolean;
  title: string;
  author?: string;
  required: boolean;
  notes?: string;
  confidence: Confidence;
}

const DATE_KINDS: ExtractedDate["kind"][] = [
  "ASSIGNMENT",
  "EXAM",
  "QUIZ",
  "READING",
  "PROJECT_MILESTONE",
  "OTHER",
];

const INFO_FIELDS: { key: string; label: string }[] = [
  { key: "code", label: "Code" },
  { key: "title", label: "Title" },
  { key: "professor", label: "Professor" },
  { key: "professorEmail", label: "Professor email" },
  { key: "location", label: "Location" },
  { key: "credits", label: "Credits" },
];

const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--gold-deep)]";
const labelCls =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";
const checkCls = "h-4 w-4 accent-[var(--gold-deep)]";
const thCls =
  "px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  HIGH: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-red-50 text-red-700 border-red-200",
};

function ConfidenceBadge({ level }: { level: Confidence }) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold ${CONFIDENCE_STYLES[level] ?? CONFIDENCE_STYLES.LOW}`}
    >
      {level}
    </span>
  );
}

function SectionHeading({
  children,
  note,
}: {
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="mb-2 mt-6 flex flex-wrap items-baseline gap-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {children}
      </h3>
      {note ? <span className="text-xs text-[var(--text-muted)]">{note}</span> : null}
    </div>
  );
}

export default function SyllabusIntake({ courses }: { courses: IntakeCourse[] }) {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [filename, setFilename] = useState("");
  const [text, setText] = useState("");

  // Step 2 (parse result + review selections)
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<SyllabusExtraction | null>(null);
  const [conflicts, setConflicts] = useState<ConflictCandidate[]>([]);
  const [aiUsed, setAiUsed] = useState(false);
  const [infoRows, setInfoRows] = useState<InfoRow[]>([]);
  const [weightRows, setWeightRows] = useState<WeightRow[]>([]);
  const [dateRows, setDateRows] = useState<DateRow[]>([]);
  const [officeRows, setOfficeRows] = useState<OfficeRow[]>([]);
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([]);

  // Step 3
  const [result, setResult] = useState<CommitResult | null>(null);

  const course = courses.find((c) => c.id === courseId);

  function updateRow<T>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    index: number,
    patch: Partial<T>,
  ) {
    setter((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function beginReview(data: ParseResponse) {
    const info = data.extraction.courseInfo ?? {};
    const rows: InfoRow[] = [];
    for (const f of INFO_FIELDS) {
      const extractedVal = (info as Record<string, unknown>)[f.key];
      if (extractedVal === undefined || extractedVal === null || extractedVal === "")
        continue;
      const currentVal = course
        ? ((course as unknown as Record<string, unknown>)[f.key] ?? "")
        : "";
      const current = currentVal === null || currentVal === undefined ? "" : String(currentVal);
      const extracted = String(extractedVal);
      if (current.trim().toLowerCase() === extracted.trim().toLowerCase()) continue;
      rows.push({
        key: f.key,
        label: f.label,
        current,
        extracted,
        value: extractedVal as string | number,
        selected: current.trim() === "", // fill blanks by default; overwrites are opt-in
      });
    }
    setInfoRows(rows);
    setWeightRows(
      (data.extraction.gradeWeights ?? []).map((w) => ({
        selected: w.confidence !== "LOW",
        category: w.category,
        weight: w.weight,
        confidence: w.confidence,
      })),
    );
    setDateRows(
      (data.extraction.dates ?? []).map((d) => ({
        selected: d.confidence !== "LOW",
        title: d.title,
        kind: d.kind,
        date: (d.date ?? "").slice(0, 10),
        time: d.time ?? "",
        details: d.details,
        confidence: d.confidence,
        sourceLine: d.sourceLine,
      })),
    );
    setOfficeRows(
      (data.extraction.officeHours ?? []).map((o) => ({
        selected: o.confidence !== "LOW",
        day: o.day,
        start: o.start,
        end: o.end,
        location: o.location,
        note: o.note,
        confidence: o.confidence,
      })),
    );
    setMaterialRows(
      (data.extraction.materials ?? []).map((m) => ({
        selected: m.confidence !== "LOW",
        title: m.title,
        author: m.author,
        required: m.required,
        notes: m.notes,
        confidence: m.confidence,
      })),
    );
  }

  async function parse() {
    setError(null);
    if (!courseId) {
      setError("Pick a course first.");
      return;
    }
    if (text.trim().length < 40) {
      setError("Paste more of the syllabus — at least 40 characters of text.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/syllabus/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          text,
          filename: filename.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Parsing failed — try again.");
        return;
      }
      const data: ParseResponse = await res.json();
      setUploadId(data.uploadId);
      setExtraction(data.extraction);
      setConflicts(data.conflicts ?? []);
      setAiUsed(data.aiUsed);
      beginReview(data);
      setStep(2);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedCount =
    infoRows.filter((r) => r.selected).length +
    weightRows.filter((r) => r.selected).length +
    dateRows.filter((r) => r.selected).length +
    officeRows.filter((r) => r.selected).length +
    materialRows.filter((r) => r.selected).length;

  async function commit() {
    if (!uploadId) return;
    setError(null);
    setBusy(true);
    try {
      const courseInfo: Record<string, string | number> = {};
      for (const r of infoRows) if (r.selected) courseInfo[r.key] = r.value;
      const res = await fetch("/api/syllabus/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          courseInfo,
          gradeWeights: weightRows
            .filter((r) => r.selected)
            .map((r) => ({ category: r.category, weight: r.weight })),
          dates: dateRows
            .filter((r) => r.selected)
            .map((r) => ({
              title: r.title.trim() || "Untitled item",
              kind: r.kind,
              date: r.date,
              time: r.time || undefined,
              details: r.details,
            })),
          officeHours: officeRows
            .filter((r) => r.selected)
            .map((r) => ({
              day: r.day,
              start: r.start,
              end: r.end,
              location: r.location,
              note: r.note,
            })),
          materials: materialRows
            .filter((r) => r.selected)
            .map((r) => ({
              title: r.title,
              author: r.author,
              required: r.required,
              notes: r.notes,
            })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Commit failed — try again.");
        return;
      }
      setResult(await res.json());
      setStep(3);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(1);
    setText("");
    setFilename("");
    setUploadId(null);
    setExtraction(null);
    setConflicts([]);
    setAiUsed(false);
    setInfoRows([]);
    setWeightRows([]);
    setDateRows([]);
    setOfficeRows([]);
    setMaterialRows([]);
    setResult(null);
    setError(null);
  }

  const stepBadge = (n: 1 | 2 | 3, label: string) => (
    <span
      className={
        step === n
          ? "rounded-full bg-[var(--black)] px-2.5 py-0.5 text-[11px] font-semibold text-white"
          : "rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]"
      }
    >
      {n} · {label}
    </span>
  );

  const errorBox = error ? (
    <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </p>
  ) : null;

  // ------------------------------------------------------------------ Step 3
  if (step === 3 && result) {
    return (
      <Card
        title="Syllabus intake"
        action={<div className="flex gap-1.5">{stepBadge(1, "Paste")}{stepBadge(2, "Review")}{stepBadge(3, "Done")}</div>}
      >
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-sm font-bold text-emerald-800">Committed</div>
          <ul className="mt-1.5 space-y-0.5 text-[13px] text-emerald-900">
            <li>{result.assignments} assignment{result.assignments === 1 ? "" : "s"} created</li>
            <li>{result.exams} exam{result.exams === 1 ? "" : "s"}/quiz{result.exams === 1 ? "" : "zes"} created</li>
            <li>
              {result.conflictsCreated === 0
                ? "No new conflicts"
                : `${result.conflictsCreated} conflict${result.conflictsCreated === 1 ? "" : "s"} flagged for review`}
            </li>
            <li>{result.courseUpdated ? "Course details updated" : "Course details unchanged"}</li>
          </ul>
        </div>
        <div className="mt-4 flex items-center gap-3">
          {course ? (
            <Link
              href={`/courses/${course.id}`}
              className="rounded-md bg-[var(--black)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Open {course.code} →
            </Link>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-0)]"
          >
            Parse another syllabus
          </button>
        </div>
      </Card>
    );
  }

  // ------------------------------------------------------------------ Step 2
  if (step === 2 && extraction) {
    return (
      <Card
        title="Syllabus intake"
        action={<div className="flex gap-1.5">{stepBadge(1, "Paste")}{stepBadge(2, "Review")}{stepBadge(3, "Commit")}</div>}
      >
        {aiUsed ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px]">
            <span className="font-semibold text-[var(--gold-deep)]">AI-refined extraction</span>
            <span className="text-[var(--text-secondary)]">
              {" "}— Claude read the full syllabus and refined the heuristic parse.
              Double-check anything marked MEDIUM or LOW.
            </span>
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-[13px]">
            <span className="font-semibold">Heuristic extraction</span>
            <span className="text-[var(--text-secondary)]">
              {" "}— pattern-based parse (no AI key configured). Review titles and
              dates carefully before committing.
            </span>
          </div>
        )}

        {extraction.warnings.length > 0 && (
          <ul className="mb-4 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            {extraction.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-800">
                ⚠ {w}
              </li>
            ))}
          </ul>
        )}

        {/* -------- Course info diff -------- */}
        {infoRows.length > 0 && (
          <>
            <SectionHeading note="checked fields overwrite the course record">
              Course info
            </SectionHeading>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={`${thCls} w-8`}>
                      <span className="sr-only">Apply</span>
                    </th>
                    <th className={thCls}>Field</th>
                    <th className={thCls}>Current</th>
                    <th className={thCls}>Extracted</th>
                  </tr>
                </thead>
                <tbody>
                  {infoRows.map((r, i) => (
                    <tr key={r.key} className="border-b border-[var(--border)]/60">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          className={checkCls}
                          checked={r.selected}
                          onChange={(e) =>
                            updateRow(setInfoRows, i, { selected: e.target.checked })
                          }
                          aria-label={`Apply ${r.label}`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-[13px] font-medium">{r.label}</td>
                      <td className="px-2 py-1.5 text-[13px] text-[var(--text-muted)]">
                        {r.current || <em>empty</em>}
                      </td>
                      <td className="px-2 py-1.5 text-[13px] font-semibold">{r.extracted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {extraction.courseInfo.meetingTimes ? (
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                Meeting times found: “{extraction.courseInfo.meetingTimes}” — edit
                weekly meetings on the course page.
              </p>
            ) : null}
          </>
        )}

        {/* -------- Grade weights -------- */}
        {weightRows.length > 0 && (
          <>
            <SectionHeading note="replaces the course grade weighting when checked">
              Grade weights
            </SectionHeading>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={`${thCls} w-8`}>
                      <span className="sr-only">Apply</span>
                    </th>
                    <th className={thCls}>Category</th>
                    <th className={thCls}>Weight</th>
                    <th className={thCls}>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {weightRows.map((r, i) => (
                    <tr key={i} className="border-b border-[var(--border)]/60">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          className={checkCls}
                          checked={r.selected}
                          onChange={(e) =>
                            updateRow(setWeightRows, i, { selected: e.target.checked })
                          }
                          aria-label={`Include ${r.category}`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-[13px] font-medium">{r.category}</td>
                      <td className="px-2 py-1.5 text-[13px]">{r.weight}%</td>
                      <td className="px-2 py-1.5">
                        <ConfidenceBadge level={r.confidence} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* -------- Dated items -------- */}
        <SectionHeading note="checked rows become assignments / exams">
          Dated items
        </SectionHeading>
        {dateRows.length === 0 ? (
          <EmptyState
            title="No dated items extracted"
            hint="The schedule may live in a table or a separate document."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className={`${thCls} w-8`}>
                    <span className="sr-only">Include</span>
                  </th>
                  <th className={thCls}>Title</th>
                  <th className={thCls}>Kind</th>
                  <th className={thCls}>Date</th>
                  <th className={thCls}>Time</th>
                  <th className={thCls}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {dateRows.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/60 align-top">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        className={checkCls}
                        checked={r.selected}
                        onChange={(e) =>
                          updateRow(setDateRows, i, { selected: e.target.checked })
                        }
                        aria-label={`Include ${r.title}`}
                      />
                    </td>
                    <td className="min-w-52 px-2 py-2">
                      <input
                        className={inputCls}
                        value={r.title}
                        onChange={(e) => updateRow(setDateRows, i, { title: e.target.value })}
                        aria-label="Item title"
                      />
                      {r.sourceLine ? (
                        <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]" title={r.sourceLine}>
                          “{r.sourceLine}”
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className={`${inputCls} w-36`}
                        value={r.kind}
                        onChange={(e) =>
                          updateRow(setDateRows, i, {
                            kind: e.target.value as ExtractedDate["kind"],
                          })
                        }
                        aria-label="Item kind"
                      >
                        {DATE_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k.replace(/_/g, " ").toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="date"
                        className={`${inputCls} w-36`}
                        value={r.date}
                        onChange={(e) => updateRow(setDateRows, i, { date: e.target.value })}
                        aria-label="Item date"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="time"
                        className={`${inputCls} w-28`}
                        value={r.time}
                        onChange={(e) => updateRow(setDateRows, i, { time: e.target.value })}
                        aria-label="Item time"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <ConfidenceBadge level={r.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* -------- Office hours -------- */}
        {officeRows.length > 0 && (
          <>
            <SectionHeading note="replaces the course office hours when checked">
              Office hours
            </SectionHeading>
            <ul className="space-y-1.5">
              {officeRows.map((o, i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    className={checkCls}
                    checked={o.selected}
                    onChange={(e) =>
                      updateRow(setOfficeRows, i, { selected: e.target.checked })
                    }
                    aria-label={`Include office hours ${o.day}`}
                  />
                  <span className="text-[13px]">
                    <span className="font-medium">{o.day}</span> {o.start}–{o.end}
                    {o.location ? ` · ${o.location}` : ""}
                  </span>
                  <ConfidenceBadge level={o.confidence} />
                </li>
              ))}
            </ul>
          </>
        )}

        {/* -------- Materials -------- */}
        {materialRows.length > 0 && (
          <>
            <SectionHeading note="replaces the course materials list when checked">
              Materials
            </SectionHeading>
            <ul className="space-y-1.5">
              {materialRows.map((m, i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    className={checkCls}
                    checked={m.selected}
                    onChange={(e) =>
                      updateRow(setMaterialRows, i, { selected: e.target.checked })
                    }
                    aria-label={`Include material ${m.title}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px]" title={m.title}>
                    <span className="font-medium">{m.title}</span>
                    {m.author ? ` — ${m.author}` : ""}
                    <span className="ml-1 text-xs text-[var(--text-muted)]">
                      {m.required ? "required" : "optional"}
                    </span>
                  </span>
                  <ConfidenceBadge level={m.confidence} />
                </li>
              ))}
            </ul>
          </>
        )}

        {/* -------- Policies + objectives (read-only) -------- */}
        {(extraction.policies.length > 0 || extraction.objectives.length > 0) && (
          <>
            <SectionHeading note="informational only — shown for reference, not written to the course record">
              Policies &amp; objectives
            </SectionHeading>
            <div className="space-y-1.5 rounded-md bg-[var(--surface-0)] px-3 py-2.5">
              {extraction.policies.map((p, i) => (
                <p key={`p-${i}`} className="text-xs text-[var(--text-secondary)]">
                  <span className="font-semibold">{p.topic}: </span>
                  {p.summary}
                </p>
              ))}
              {extraction.objectives.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4">
                  {extraction.objectives.map((o, i) => (
                    <li key={`o-${i}`} className="text-xs text-[var(--text-secondary)]">
                      {o}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* -------- Conflicts detected against existing data -------- */}
        {conflicts.length > 0 && (
          <>
            <SectionHeading note="recorded as Conflict rows when you commit — resolve them from this page afterwards">
              Conflicts with existing records
            </SectionHeading>
            <div className="space-y-3">
              {conflicts.map((c, i) => (
                <ConflictCard
                  key={i}
                  description={c.description}
                  sourceA={c.sourceA}
                  valueA={c.valueA}
                  sourceB={c.sourceB}
                  valueB={c.valueB}
                  suggestion={c.suggestion}
                />
              ))}
            </div>
          </>
        )}

        {errorBox}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={commit}
            disabled={busy}
            className="rounded-md bg-[var(--black)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? "Committing…"
              : `Commit ${selectedCount} item${selectedCount === 1 ? "" : "s"}`}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-0)] disabled:opacity-50"
          >
            Start over
          </button>
        </div>
      </Card>
    );
  }

  // ------------------------------------------------------------------ Step 1
  return (
    <Card
      title="Syllabus intake"
      action={<div className="flex gap-1.5">{stepBadge(1, "Paste")}{stepBadge(2, "Review")}{stepBadge(3, "Commit")}</div>}
    >
      {courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          hint="Create a course first — the syllabus commits into it."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="syllabus-course">
                Course *
              </label>
              <select
                id="syllabus-course"
                className={inputCls}
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="syllabus-filename">
                Label (optional)
              </label>
              <input
                id="syllabus-filename"
                className={inputCls}
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="cs2201-syllabus-fall.pdf"
              />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="syllabus-text">
              Syllabus text *
            </label>
            <textarea
              id="syllabus-text"
              className={`${inputCls} min-h-64 font-mono text-[13px] leading-relaxed`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the full syllabus text here — schedule, grading breakdown, office hours, policies…"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Every extracted item is shown for review before anything is written —
              nothing commits without your say-so.
            </p>
          </div>
          {errorBox}
          <button
            type="button"
            onClick={parse}
            disabled={busy}
            className="rounded-md bg-[var(--black)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Parsing…" : "Parse syllabus"}
          </button>
        </div>
      )}
    </Card>
  );
}
