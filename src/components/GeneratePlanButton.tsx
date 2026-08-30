"use client";

// One-click study-plan generation for an exam. POSTs to /api/exams/[id]/plan,
// briefly surfaces how many sessions were planned, then refreshes the page so
// the new WorkSession rows appear.

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";

export default function GeneratePlanButton({
  examId,
  hasPlan = false,
  compact = false,
}: {
  examId: string;
  /** When true the label reads "Regenerate plan". */
  hasPlan?: boolean;
  /** Smaller padding for use inside list rows. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/exams/${examId}/plan`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not generate a plan.");
        return;
      }
      const created = typeof json.created === "number" ? json.created : 0;
      setNote(`${created} session${created === 1 ? "" : "s"} planned`);
      setTimeout(() => setNote(null), 4000);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const label = busy
    ? "Planning…"
    : hasPlan
      ? "Regenerate plan"
      : "Generate study plan";

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        title={note ?? (hasPlan ? "Replace the uncompleted study sessions with a fresh plan" : "Auto-plan study sessions for this exam")}
        className={clsx(
          "rounded-md font-semibold disabled:opacity-50",
          compact ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
          hasPlan
            ? "border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:border-[var(--gold-deep)] hover:text-[var(--gold-deep)]"
            : "bg-[var(--gold-deep)] text-white hover:opacity-90",
        )}
      >
        {label}
      </button>
      {note ? (
        <span className="text-xs font-medium text-[var(--status-good)]">{note}</span>
      ) : null}
      {error ? (
        <span className="text-xs font-medium text-[var(--status-critical)]">{error}</span>
      ) : null}
    </span>
  );
}
