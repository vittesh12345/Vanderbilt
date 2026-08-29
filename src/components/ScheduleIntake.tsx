"use client";

// YES / VSTAR schedule paste: paste, review every parsed course, commit.
//
// The review step is the point of the whole component. A schedule parsed out
// of pasted text is a guess about the most load-bearing data in the app —
// every calendar, class-prep brief, and workload forecast is built on when
// classes meet — so nothing is written until the student has seen each row
// and each warning.

import { useRouter } from "next/navigation";
import { useState } from "react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const KINDS = ["LECTURE", "LAB", "DISCUSSION", "SEMINAR"] as const;

interface Meeting {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string | null;
  kind: string;
  sourceLine: string;
  inferredMeridiem: boolean;
}

interface Course {
  code: string;
  title: string;
  section: string | null;
  credits: number | null;
  professor: string | null;
  location: string | null;
  meetings: Meeting[];
  confidence: "VERIFIED" | "LIKELY" | "UNVERIFIED";
  warnings: string[];
  sourceLines: string[];
  existingCourseId: string | null;
  existingTitle: string | null;
  existingMeetingCount: number;
}

interface PreviewResult {
  term: string | null;
  warnings: string[];
  courses: Course[];
  notInPaste: {
    id: string;
    code: string;
    title: string;
    assignments: number;
    exams: number;
  }[];
  semester: { id: string; name: string; isCurrent: boolean } | null;
}

type Row = Course & { include: boolean };

const inputCls =
  "rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--gold-deep)]";

function ConfidenceBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    LIKELY: "border-amber-200 bg-amber-50 text-amber-800",
    UNVERIFIED: "border-neutral-200 bg-neutral-100 text-neutral-600",
  };
  const labels: Record<string, string> = {
    VERIFIED: "Parsed cleanly",
    LIKELY: "Check this",
    UNVERIFIED: "Needs input",
  };
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${styles[level] ?? styles.UNVERIFIED}`}
    >
      {labels[level] ?? level}
    </span>
  );
}

export default function ScheduleIntake() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [termMode, setTermMode] = useState<"CURRENT" | "NEW">("CURRENT");
  const [summary, setSummary] = useState<string[] | null>(null);

  async function preview() {
    setError(null);
    setSummary(null);
    setBusy(true);
    try {
      const res = await fetch("/api/ingest/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not read that schedule.");
        return;
      }
      setResult(data);
      setRows(data.courses.map((c: Course) => ({ ...c, include: true })));
      // A term the app has never seen is a new semester, not an edit of the
      // old one — default accordingly, but let the student override.
      setTermMode(
        data.term && data.semester && data.term !== data.semester.name
          ? "NEW"
          : "CURRENT",
      );
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!result) return;
    const courses = rows
      .filter((r) => r.include)
      .map((r) => ({
        code: r.code,
        title: r.title,
        credits: r.credits,
        professor: r.professor,
        location: r.location,
        meetings: r.meetings,
        existingCourseId: termMode === "NEW" ? null : r.existingCourseId,
        mode: "CREATE" as const,
      }));
    if (!courses.length) {
      setError("Nothing selected.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ingest/schedule/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courses, termMode, termName: result.term }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Commit failed.");
        return;
      }
      const lines = [
        `${data.created} course${data.created === 1 ? "" : "s"} created, ${data.updated} updated, ${data.skipped} skipped in ${data.semester.name}.`,
      ];
      if (data.conflicts?.length) {
        lines.push(
          `${data.conflicts.length} disagreement${data.conflicts.length === 1 ? "" : "s"} with existing records flagged above rather than overwritten: ${data.conflicts.join("; ")}.`,
        );
      }
      if (data.errors?.length) lines.push(...data.errors);
      lines.push(
        "Check the term start and end dates on Settings — they are conventional defaults, not from YES.",
      );
      setSummary(lines);
      setResult(null);
      setRows([]);
      setText("");
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function updateMeeting(ri: number, mi: number, patch: Partial<Meeting>) {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === ri
          ? {
              ...r,
              meetings: r.meetings.map((m, j) =>
                j === mi ? { ...m, ...patch } : m,
              ),
            }
          : r,
      ),
    );
  }

  function removeMeeting(ri: number, mi: number) {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === ri
          ? { ...r, meetings: r.meetings.filter((_, j) => j !== mi) }
          : r,
      ),
    );
  }

  function addMeeting(ri: number) {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === ri
          ? {
              ...r,
              meetings: [
                ...r.meetings,
                {
                  dayOfWeek: 1,
                  startTime: "10:00",
                  endTime: "11:00",
                  location: r.location,
                  kind: "LECTURE",
                  sourceLine: "added by hand",
                  inferredMeridiem: false,
                },
              ],
            }
          : r,
      ),
    );
  }

  return (
    <div>
      {summary && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          {summary.map((l, i) => (
            <p key={i} className={i ? "mt-1" : ""}>
              {l}
            </p>
          ))}
        </div>
      )}

      {!result && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={
              "Paste your YES schedule here — select the whole schedule table (or the printable class list) and copy.\n\nExample:\nCS 1101-01\tProgramming and Problem Solving\tMWF\t10:10AM - 11:00AM\tFeatheringill 134\tA. Rivera\t3.00"
            }
            className="w-full rounded-md border border-[var(--border)] bg-white p-3 font-mono text-xs outline-none focus:border-[var(--gold-deep)]"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={preview}
              disabled={busy || !text.trim()}
              className="rounded-md bg-[var(--black)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Reading…" : "Read schedule"}
            </button>
            <span className="text-[11px] text-[var(--text-muted)]">
              Nothing is saved until you review it.
            </span>
          </div>
        </>
      )}

      {error && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2">
            <div className="text-xs text-[var(--text-secondary)]">
              Found <strong>{result.courses.length}</strong> course
              {result.courses.length === 1 ? "" : "s"}
              {result.term ? ` for ${result.term}` : ""}. Review every row.
            </div>
            <button
              onClick={() => {
                setResult(null);
                setRows([]);
              }}
              className="text-xs text-[var(--text-muted)] underline"
            >
              Start over
            </button>
          </div>

          {result.warnings.map((w, i) => (
            <p
              key={i}
              className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
            >
              {w}
            </p>
          ))}

          {result.term && result.semester && result.term !== result.semester.name && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-0)] p-3 text-xs">
              <p className="mb-2">
                This schedule says <strong>{result.term}</strong>, but the
                active semester on file is{" "}
                <strong>{result.semester.name}</strong>.
              </p>
              <label className="mr-4">
                <input
                  type="radio"
                  className="mr-1"
                  checked={termMode === "NEW"}
                  onChange={() => setTermMode("NEW")}
                />
                Start {result.term} as a new semester
              </label>
              <label>
                <input
                  type="radio"
                  className="mr-1"
                  checked={termMode === "CURRENT"}
                  onChange={() => setTermMode("CURRENT")}
                />
                Add to {result.semester.name}
              </label>
            </div>
          )}

          {rows.map((r, ri) => (
            <div
              key={r.code}
              className={`rounded-md border p-3 ${r.include ? "border-[var(--border)]" : "border-dashed border-[var(--border)] opacity-50"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => updateRow(ri, { include: e.target.checked })}
                />
                <input
                  value={r.code}
                  onChange={(e) => updateRow(ri, { code: e.target.value })}
                  className={`${inputCls} w-28 font-semibold`}
                />
                <input
                  value={r.title}
                  onChange={(e) => updateRow(ri, { title: e.target.value })}
                  className={`${inputCls} min-w-0 flex-1`}
                />
                <ConfidenceBadge level={r.confidence} />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-[var(--text-muted)]">
                  Instructor
                  <input
                    value={r.professor ?? ""}
                    onChange={(e) =>
                      updateRow(ri, { professor: e.target.value || null })
                    }
                    className={`${inputCls} ml-1 w-44`}
                  />
                </label>
                <label className="text-[11px] text-[var(--text-muted)]">
                  Credits
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="12"
                    value={r.credits ?? ""}
                    onChange={(e) =>
                      updateRow(ri, {
                        credits: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className={`${inputCls} ml-1 w-16`}
                  />
                </label>
                {r.existingCourseId && termMode === "CURRENT" && (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                    Already on file ({r.existingMeetingCount} meeting
                    {r.existingMeetingCount === 1 ? "" : "s"}) — meetings will be
                    replaced
                  </span>
                )}
              </div>

              {r.warnings.map((w, i) => (
                <p key={i} className="mt-2 text-[11px] text-amber-800">
                  {w}
                </p>
              ))}

              <div className="mt-2 space-y-1">
                {r.meetings.map((m, mi) => (
                  <div key={mi} className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={m.dayOfWeek}
                      onChange={(e) =>
                        updateMeeting(ri, mi, {
                          dayOfWeek: Number(e.target.value),
                        })
                      }
                      className={inputCls}
                    >
                      {DAY_NAMES.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={m.startTime}
                      onChange={(e) =>
                        updateMeeting(ri, mi, { startTime: e.target.value })
                      }
                      className={inputCls}
                    />
                    <input
                      type="time"
                      value={m.endTime}
                      onChange={(e) =>
                        updateMeeting(ri, mi, { endTime: e.target.value })
                      }
                      className={inputCls}
                    />
                    <select
                      value={m.kind}
                      onChange={(e) =>
                        updateMeeting(ri, mi, { kind: e.target.value })
                      }
                      className={inputCls}
                    >
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k[0] + k.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                    <input
                      value={m.location ?? ""}
                      placeholder="Room"
                      onChange={(e) =>
                        updateMeeting(ri, mi, {
                          location: e.target.value || null,
                        })
                      }
                      className={`${inputCls} w-44`}
                    />
                    {m.inferredMeridiem && (
                      <span className="text-[10px] font-semibold text-amber-700">
                        AM/PM guessed
                      </span>
                    )}
                    <button
                      onClick={() => removeMeeting(ri, mi)}
                      className="text-[11px] text-[var(--text-muted)] underline"
                    >
                      remove
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addMeeting(ri)}
                  className="text-[11px] text-[var(--text-muted)] underline"
                >
                  + add a meeting
                </button>
              </div>

              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-[var(--text-muted)]">
                  Show the lines this came from
                </summary>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-[var(--surface-0)] p-2 text-[10px] text-[var(--text-secondary)]">
                  {r.sourceLines.join("\n")}
                </pre>
              </details>
            </div>
          ))}

          {result.notInPaste.length > 0 && termMode === "CURRENT" && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-0)] p-3 text-xs">
              <p className="font-semibold">
                On file but not in this paste — dropped, or demo data?
              </p>
              <ul className="mt-1 space-y-0.5 text-[var(--text-secondary)]">
                {result.notInPaste.map((c) => (
                  <li key={c.id}>
                    {c.code} — {c.title} ({c.assignments} assignments, {c.exams}{" "}
                    exams).{" "}
                    <a
                      className="underline"
                      href={`/courses/${c.id}/edit`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open to edit or delete
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Nothing is deleted here. Deleting a course takes its
                assignments, exams, and study sessions with it, so that stays a
                deliberate act on the course page.
              </p>
            </div>
          )}

          <button
            onClick={commit}
            disabled={busy}
            className="rounded-md bg-[var(--black)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {busy
              ? "Saving…"
              : `Save ${rows.filter((r) => r.include).length} course${rows.filter((r) => r.include).length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}
