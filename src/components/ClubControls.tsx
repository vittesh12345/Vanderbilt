"use client";

// Small interactive controls for club rows: membership select and the
// application tracker (NOT_OPEN → … → ACCEPTED/REJECTED pipeline).

import { useRouter } from "next/navigation";
import { useState } from "react";

const MEMBERSHIPS = [
  "PROSPECT",
  "INTERESTED",
  "MEMBER",
  "LEADER",
  "ALUMNI",
  "NOT_PURSUING",
] as const;

const APP_STATUSES = [
  "NOT_OPEN",
  "OPEN",
  "APPLYING",
  "SUBMITTED",
  "INTERVIEW",
  "ACCEPTED",
  "REJECTED",
] as const;

export function MembershipSelect({
  clubId,
  membership,
}: {
  clubId: string;
  membership: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(value: string) {
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership: value }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={membership}
      onChange={(e) => change(e.target.value)}
      disabled={busy}
      className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-1.5 py-1 text-xs"
      aria-label="Membership status"
    >
      {MEMBERSHIPS.map((m) => (
        <option key={m} value={m}>
          {m.replace(/_/g, " ").toLowerCase()}
        </option>
      ))}
    </select>
  );
}

export interface AppRow {
  id: string;
  cycle: string | null;
  status: string;
  opensAt: string | null;
  deadlineAt: string | null;
  interviewAt: string | null;
  notes: string | null;
}

export function ApplicationTracker({
  clubId,
  applications,
}: {
  clubId: string;
  applications: AppRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cycle, setCycle] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");

  async function patch(id: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/club-apps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      await fetch("/api/club-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId,
          cycle: cycle || undefined,
          opensAt: opensAt || undefined,
          deadlineAt: deadlineAt || undefined,
          status: opensAt && new Date(opensAt) > new Date() ? "NOT_OPEN" : "OPEN",
        }),
      });
      setAdding(false);
      setCycle("");
      setOpensAt("");
      setDeadlineAt("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--gold-deep)]";

  return (
    <div className="space-y-2">
      {applications.length === 0 && !adding ? (
        <p className="text-xs text-[var(--text-muted)]">
          No application cycles tracked yet.
        </p>
      ) : null}
      {applications.map((app) => (
        <div
          key={app.id}
          className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] px-2.5 py-1.5"
        >
          <span className="text-xs font-semibold">{app.cycle ?? "Cycle"}</span>
          <select
            value={app.status}
            onChange={(e) => patch(app.id, { status: e.target.value })}
            disabled={busy}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-1.5 py-0.5 text-xs"
            aria-label="Application status"
          >
            {APP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
          <label className="text-[10px] text-[var(--text-muted)]">
            opens{" "}
            <input
              type="date"
              defaultValue={app.opensAt?.slice(0, 10) ?? ""}
              onBlur={(e) =>
                e.target.value !== (app.opensAt?.slice(0, 10) ?? "") &&
                patch(app.id, { opensAt: e.target.value || null })
              }
              className={inputCls}
            />
          </label>
          <label className="text-[10px] text-[var(--text-muted)]">
            deadline{" "}
            <input
              type="date"
              defaultValue={app.deadlineAt?.slice(0, 10) ?? ""}
              onBlur={(e) =>
                e.target.value !== (app.deadlineAt?.slice(0, 10) ?? "") &&
                patch(app.id, { deadlineAt: e.target.value || null })
              }
              className={inputCls}
            />
          </label>
          <label className="text-[10px] text-[var(--text-muted)]">
            interview{" "}
            <input
              type="date"
              defaultValue={app.interviewAt?.slice(0, 10) ?? ""}
              onBlur={(e) =>
                e.target.value !== (app.interviewAt?.slice(0, 10) ?? "") &&
                patch(app.id, { interviewAt: e.target.value || null })
              }
              className={inputCls}
            />
          </label>
          <button
            onClick={async () => {
              if (!window.confirm("Remove this application cycle?")) return;
              await fetch(`/api/club-apps/${app.id}`, { method: "DELETE" });
              router.refresh();
            }}
            className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--status-critical)]"
          >
            remove
          </button>
        </div>
      ))}
      {adding ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-[var(--border)] px-2.5 py-1.5">
          <input
            placeholder="Cycle (e.g. Fall 2026)"
            value={cycle}
            onChange={(e) => setCycle(e.target.value)}
            className={inputCls}
          />
          <label className="text-[10px] text-[var(--text-muted)]">
            opens{" "}
            <input type="date" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className={inputCls} />
          </label>
          <label className="text-[10px] text-[var(--text-muted)]">
            deadline{" "}
            <input type="date" value={deadlineAt} onChange={(e) => setDeadlineAt(e.target.value)} className={inputCls} />
          </label>
          <button
            onClick={create}
            disabled={busy}
            className="rounded-md bg-[var(--black)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            Track
          </button>
          <button
            onClick={() => setAdding(false)}
            className="text-xs text-[var(--text-muted)]"
          >
            cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs font-medium text-[var(--gold-deep)] hover:underline"
        >
          + Track an application cycle
        </button>
      )}
    </div>
  );
}
