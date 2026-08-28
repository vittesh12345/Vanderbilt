"use client";

// Assignment intelligence table: filter chips + course select, priority
// reasoning from the ranking engine, inline status transitions (with actual
// minutes capture on completion), and per-row plan/edit/delete actions.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { ASSIGNMENT_STATUSES } from "@/lib/types";
import { dueLabel, fmtDateTime, fmtMinutesRange } from "@/lib/dates";
import { CourseDot, EmptyState, PriorityTag } from "@/components/ui";

/** JSON-safe row shape the server page serializes to (dates as ISO strings). */
export interface AssignmentRowData {
  id: string;
  title: string;
  kind: string;
  status: string;
  dueAt: string | null; // ISO
  estMinutes: number | null;
  estMinutesMax: number | null;
  gradeWeight: number | null;
  courseId: string;
  courseCode: string;
  courseColor: string;
  score: number | null;
  priority: string | null;
  reason: string | null;
}

export interface CourseOption {
  id: string;
  code: string;
  color: string;
}

const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"];
const DONE_STATUSES = ["COMPLETED", "SUBMITTED"];

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "BLOCKED", label: "Blocked" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "COMPLETED", label: "Completed" },
  { key: "OVERDUE", label: "Overdue" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function matchesFilter(row: AssignmentRowData, filter: FilterKey, now: Date): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "OPEN":
      return OPEN_STATUSES.includes(row.status);
    case "OVERDUE":
      return (
        row.status === "OVERDUE" ||
        (OPEN_STATUSES.includes(row.status) &&
          row.dueAt != null &&
          new Date(row.dueAt) < now)
      );
    default:
      return row.status === filter;
  }
}

export default function AssignmentTable({
  rows,
  courses,
}: {
  rows: AssignmentRowData[];
  courses: CourseOption[];
}) {
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [courseId, setCourseId] = useState<string>("ALL");

  const now = useMemo(() => new Date(), []);
  const visible = rows.filter(
    (r) =>
      matchesFilter(r, filter, now) &&
      (courseId === "ALL" || r.courseId === courseId),
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "border-[var(--gold-deep)] bg-[var(--gold)]/20 font-semibold text-[var(--gold-deep)]"
                  : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:border-[var(--gold)]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="ml-auto rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-xs"
          aria-label="Filter by course"
        >
          <option value="ALL">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No assignments match this view"
          hint="Change the filters, or add one with “New assignment”."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-3 py-2.5">Course</th>
                <th className="px-3 py-2.5">Assignment</th>
                <th className="px-3 py-2.5">Due</th>
                <th className="px-3 py-2.5">Est</th>
                <th className="px-3 py-2.5">Weight</th>
                <th className="px-3 py-2.5">Priority</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <AssignmentRow key={row.id} row={row} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AssignmentRow({ row, now }: { row: AssignmentRowData; now: Date }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Set when COMPLETED/SUBMITTED was chosen and we're collecting actual minutes.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [actualMinutes, setActualMinutes] = useState("");
  const [planMsg, setPlanMsg] = useState<string | null>(null);

  const due = row.dueAt ? new Date(row.dueAt) : null;
  const isDone = DONE_STATUSES.includes(row.status);
  const overdue =
    !isDone && due != null && due < now;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/assignments/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setPendingStatus(null);
      setActualMinutes("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function onStatusChange(next: string) {
    if (next === row.status) return;
    if (DONE_STATUSES.includes(next)) {
      setPendingStatus(next); // collect actual minutes first
    } else {
      void patch({ status: next });
    }
  }

  function submitDone() {
    if (!pendingStatus) return;
    const mins = Number(actualMinutes);
    void patch({
      status: pendingStatus,
      ...(Number.isFinite(mins) && mins > 0 ? { actualMinutes: mins } : {}),
    });
  }

  async function plan() {
    setBusy(true);
    setPlanMsg(null);
    try {
      const res = await fetch(`/api/assignments/${row.id}/plan`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setPlanMsg(`${json.created} session${json.created === 1 ? "" : "s"} planned`);
        router.refresh();
      } else {
        setPlanMsg(json.error ?? "Could not plan sessions");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${row.title}”? Its planned sessions go with it.`)) {
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/assignments/${row.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-[var(--border)] last:border-b-0 align-top">
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          <CourseDot color={row.courseColor} />
          <span className="text-[13px] font-medium">{row.courseCode}</span>
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className={clsx("text-[13px] font-semibold", isDone && "line-through opacity-60")}>
          {row.title}
        </div>
        <div className="text-[11px] text-[var(--text-muted)]">
          {row.kind.replace(/_/g, " ").toLowerCase()}
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {due ? (
          <span
            title={fmtDateTime(due)}
            className={clsx(
              "text-[13px]",
              overdue ? "font-semibold text-[var(--status-critical)]" : "text-[var(--text-secondary)]",
            )}
          >
            {dueLabel(due, now)}
          </span>
        ) : (
          <span className="text-[13px] text-[var(--text-muted)]">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-[13px] text-[var(--text-secondary)]">
        {row.estMinutes ? fmtMinutesRange(row.estMinutes, row.estMinutesMax) : "—"}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-[13px] text-[var(--text-secondary)]">
        {row.gradeWeight != null ? `${row.gradeWeight}%` : "—"}
      </td>
      <td className="max-w-[220px] px-3 py-2.5">
        {row.priority ? (
          <div title={row.score != null ? `Engine score: ${Math.round(row.score)}` : undefined}>
            <PriorityTag priority={row.priority} />
            {row.reason ? (
              <div
                className="mt-0.5 max-w-[200px] truncate text-[11px] text-[var(--text-muted)]"
                title={row.reason}
              >
                {row.reason}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-[13px] text-[var(--text-muted)]">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <select
          value={pendingStatus ?? row.status}
          onChange={(e) => onStatusChange(e.target.value)}
          disabled={busy}
          className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-1.5 py-1 text-xs"
          aria-label="Assignment status"
        >
          {ASSIGNMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </select>
        {pendingStatus ? (
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              value={actualMinutes}
              onChange={(e) => setActualMinutes(e.target.value)}
              placeholder="actual min"
              className="w-[76px] rounded-md border border-[var(--border)] px-1.5 py-1 text-xs"
              aria-label="Actual minutes spent"
            />
            <button
              type="button"
              onClick={submitDone}
              disabled={busy}
              className="rounded-md bg-[var(--gold-deep)] px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingStatus(null);
                setActualMinutes("");
              }}
              className="text-[11px] text-[var(--text-muted)] hover:underline"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-2.5">
          <button
            type="button"
            onClick={plan}
            disabled={busy}
            title="Split this assignment into work sessions on the lightest days before it's due"
            className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--gold)] hover:text-[var(--gold-deep)] disabled:opacity-50"
          >
            Plan sessions
          </button>
          <Link
            href={`/assignments/${row.id}/edit`}
            className="text-[11px] font-medium text-[var(--gold-deep)] hover:underline"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-[11px] font-medium text-[var(--status-critical)] hover:underline disabled:opacity-50"
          >
            Delete
          </button>
        </div>
        {planMsg ? (
          <div className="mt-1 text-[11px] text-[var(--text-muted)]">{planMsg}</div>
        ) : null}
      </td>
    </tr>
  );
}
