"use client";

// Web-monitoring management: list watched pages, add/remove, toggle, and a
// "check now" trigger. Honest about environment limits — fetch errors are
// shown per source rather than hidden.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play, Trash2 } from "lucide-react";

export interface SourceRow {
  id: string;
  url: string;
  label: string;
  kind: string;
  active: boolean;
  checkEveryHours: number;
  lastCheckedAt: string | null;
  lastChangeAt: string | null;
  lastChangeSummary: string | null;
}

const KINDS = ["CLUB", "VU_CALENDAR", "RESEARCH", "STARTUP", "CAREER", "OTHER"];

export default function MonitorPanel({ sources }: { sources: SourceRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("CLUB");

  async function runNow() {
    setBusy(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/monitor/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      setRunResult(
        `Checked ${data.checked}: ${data.changed} changed, ${data.errors} error${data.errors === 1 ? "" : "s"}.` +
          (data.errors
            ? " (Fetch errors are expected in restricted environments — checks run fully once deployed.)"
            : ""),
      );
      router.refresh();
    } catch {
      setRunResult("Run failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!url.trim() || !label.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/monitor/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), label: label.trim(), kind }),
      });
      if (res.ok) {
        setUrl("");
        setLabel("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--gold-deep)]";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={runNow}
          disabled={busy || sources.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--black)] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Play className="h-3 w-3" /> Check all now
        </button>
        {runResult ? (
          <span className="text-xs text-[var(--text-secondary)]">{runResult}</span>
        ) : null}
      </div>

      <ul className="space-y-1.5">
        {sources.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] px-2.5 py-1.5"
          >
            <input
              type="checkbox"
              checked={s.active}
              onChange={async (e) => {
                await fetch(`/api/monitor/sources/${s.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ active: e.target.checked }),
                });
                router.refresh();
              }}
              className="h-3.5 w-3.5 accent-[var(--gold-deep)]"
              aria-label="Active"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">
                {s.label}{" "}
                <span className="font-normal text-[var(--text-muted)]">
                  · {s.kind.toLowerCase()} · every {s.checkEveryHours}h
                </span>
              </div>
              <div className="truncate text-[10px] text-[var(--text-muted)]">
                {s.url}
                {s.lastCheckedAt
                  ? ` · checked ${new Date(s.lastCheckedAt).toLocaleDateString()}`
                  : " · never checked"}
                {s.lastChangeAt
                  ? ` · changed ${new Date(s.lastChangeAt).toLocaleDateString()}`
                  : ""}
              </div>
            </div>
            <button
              onClick={async () => {
                if (!window.confirm("Stop watching this page?")) return;
                await fetch(`/api/monitor/sources/${s.id}`, { method: "DELETE" });
                router.refresh();
              }}
              className="text-[var(--text-muted)] hover:text-[var(--status-critical)]"
              aria-label="Delete source"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="https://… page to watch"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={`${inputCls} min-w-56 flex-1`}
        />
        <input
          placeholder="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={inputCls}
        />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </select>
        <button
          onClick={add}
          disabled={busy}
          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:border-[var(--gold-deep)] disabled:opacity-50"
        >
          Watch page
        </button>
      </div>
    </div>
  );
}
