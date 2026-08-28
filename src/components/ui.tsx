// Shared presentational kit. Server-safe (no hooks) so both server and client
// components can import from here. Identity is carried by a colored dot or
// left border; text always wears text tokens, never the series color.

import clsx from "clsx";
import { LOAD_COLORS, LOAD_LABELS } from "@/lib/palette";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className,
  title,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section
      className={clsx(
        "rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-sm",
        className,
      )}
    >
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function CourseDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

const STATUS_STYLES: Record<string, string> = {
  NOT_STARTED: "bg-neutral-100 text-neutral-600 border-neutral-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
  BLOCKED: "bg-orange-50 text-orange-700 border-orange-200",
  SUBMITTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  OVERDUE: "bg-red-50 text-red-700 border-red-200",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        STATUS_STYLES[status] ?? STATUS_STYLES.NOT_STARTED,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-red-50 text-red-700 border-red-200",
  HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

export function PriorityTag({ priority }: { priority: string }) {
  return (
    <span
      className={clsx(
        "inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold",
        PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.LOW,
      )}
    >
      {priority}
    </span>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  URGENT: "border-l-[var(--status-critical)]",
  WARNING: "border-l-[var(--status-warning)]",
  INFO: "border-l-[var(--series-1)]",
};

export function AlertRow({
  severity,
  title,
  body,
}: {
  severity: string;
  title: string;
  body: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-md border border-[var(--border)] border-l-4 bg-white px-3 py-2",
        SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.INFO,
      )}
    >
      <div className="text-[13px] font-semibold">{title}</div>
      <div className="text-xs text-[var(--text-secondary)]">{body}</div>
    </div>
  );
}

/** Workload level chip: ordinal color + ALWAYS the text label (never color alone). */
export function LoadChip({ level }: { level: string }) {
  const isDark = level === "HIGH" || level === "VERY_HIGH" || level === "EXTREME";
  return (
    <span
      className={clsx(
        "inline-block rounded px-1.5 py-0.5 text-[10px] font-bold",
        isDark ? "text-white" : "text-[#0b2a52]",
      )}
      style={{ backgroundColor: LOAD_COLORS[level] ?? LOAD_COLORS.NORMAL }}
    >
      {LOAD_LABELS[level] ?? level}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-bold">{value}</div>
      {hint ? <div className="text-xs text-[var(--text-secondary)]">{hint}</div> : null}
    </div>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200/70">
      <div
        className="h-full rounded-full"
        style={{ width: `${clamped}%`, backgroundColor: color ?? "var(--gold-deep)" }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-center">
      <div className="text-sm font-medium text-[var(--text-secondary)]">{title}</div>
      {hint ? <div className="mt-1 text-xs text-[var(--text-muted)]">{hint}</div> : null}
    </div>
  );
}

export function SourceTag({
  source,
  verifiedAt,
}: {
  source: string;
  verifiedAt?: Date | null;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
      {source.replace(/_/g, " ").toLowerCase()}
      {verifiedAt
        ? ` · verified ${verifiedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : null}
    </span>
  );
}
