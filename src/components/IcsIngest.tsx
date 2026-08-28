"use client";

// Brightspace / VSTAR calendar-feed intake: paste the personal iCal
// subscription URL (Brightspace → Calendar → Settings → "Enable Calendar
// Feeds") or the .ics contents, review the classified candidates, commit.

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Candidate {
  title: string;
  kind: "ASSIGNMENT" | "EXAM" | "QUIZ" | "EVENT";
  at: string;
  endAt?: string;
  location?: string;
  url?: string;
  courseCode?: string;
  matchedCourseId: string | null;
  sourceLine: string;
}

interface ParseResult {
  total: number;
  inWindow: number;
  candidates: Candidate[];
  courses: { id: string; code: string }[];
}

const KINDS = ["ASSIGNMENT", "EXAM", "QUIZ", "EVENT"] as const;

const inputCls =
  "rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--gold-deep)]";

export default function IcsIngest() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [icsText, setIcsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<(Candidate & { include: boolean })[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  async function parse() {
    setError(null);
    setSummary(null);
    setBusy(true);
    try {
      const res = await fetch("/api/ingest/ics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim() || undefined,
          icsText: icsText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not parse the feed.");
        return;
      }
      setResult(data);
      setRows(
        data.candidates.map((c: Candidate) => ({
          ...c,
          include: c.kind !== "EVENT" ? Boolean(c.matchedCourseId) : true,
        })),
      );
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!result) return;
    const items = rows
      .filter((r) => r.include)
      .map((r) => ({
        title: r.title,
        kind: r.kind,
        at: r.at,
        courseId: r.matchedCourseId,
        location: r.location,
        url: r.url,
      }));
    if (!items.length) {
      setError("Nothing selected.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ingest/ics/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Commit failed.");
        return;
      }
      setSummary(
        `Created ${data.createdAssignments} assignments, ${data.createdExams} exams, ${data.createdEvents} events (${data.skipped} duplicates skipped).`,
      );
      setResult(null);
      setRows([]);
      setIcsText("");
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  function update(i: number, patch: Partial<Candidate & { include: boolean }>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-3">
      {summary ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {summary}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!result ? (
        <div className="space-y-2">
          <input
            placeholder="Brightspace iCal feed URL (Calendar → Settings → Enable Calendar Feeds)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={`${inputCls} w-full`}
          />
          <div className="text-center text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            or paste the .ics contents
          </div>
          <textarea
            placeholder="BEGIN:VCALENDAR…"
            value={icsText}
            onChange={(e) => setIcsText(e.target.value)}
            rows={4}
            className={`${inputCls} w-full font-mono`}
          />
          <button
            onClick={parse}
            disabled={busy || (!url.trim() && !icsText.trim())}
            className="rounded-md bg-[var(--black)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Parsing…" : "Parse feed"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-[var(--text-secondary)]">
            {result.inWindow} upcoming item{result.inWindow === 1 ? "" : "s"} found
            ({result.total} total in feed). Review, adjust, commit.
          </div>
          <div className="thin-scroll max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {rows.map((r, i) => (
              <div
                key={i} /* rows never reorder; an editable-title key would remount (and collide) */
                className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] px-2.5 py-1.5"
              >
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => update(i, { include: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[var(--gold-deep)]"
                />
                <input
                  value={r.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  className={`${inputCls} min-w-40 flex-1`}
                />
                <select
                  value={r.kind}
                  onChange={(e) => update(i, { kind: e.target.value as Candidate["kind"] })}
                  className={inputCls}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k.toLowerCase()}
                    </option>
                  ))}
                </select>
                <select
                  value={r.matchedCourseId ?? ""}
                  onChange={(e) => update(i, { matchedCourseId: e.target.value || null })}
                  className={inputCls}
                >
                  <option value="">no course (calendar event)</option>
                  {result.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {new Date(r.at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={commit}
              disabled={busy}
              className="rounded-md bg-[var(--black)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Commit {rows.filter((r) => r.include).length} items
            </button>
            <button
              onClick={() => {
                setResult(null);
                setRows([]);
              }}
              className="text-xs text-[var(--text-muted)] hover:underline"
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
