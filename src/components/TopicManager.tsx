"use client";

// Knowledge-retention tracker for one course. Topics carry a mastery badge
// that cycles through the levels on click; each topic takes "what didn't I
// understand?" entries (stored newest-first) and can be deleted.

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { MASTERY_LEVELS } from "@/lib/types";

export interface TopicItem {
  id: string;
  name: string;
  mastery: string;
  confusions: string[];
  lastReviewedAt: string | null; // ISO
}

const MASTERY_STYLES: Record<string, string> = {
  INTRODUCED: "bg-neutral-100 text-neutral-600 border-neutral-200",
  REVIEWED: "bg-blue-50 text-blue-700 border-blue-200",
  PRACTICED: "bg-amber-50 text-amber-700 border-amber-200",
  MASTERED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  NEEDS_REVIEW: "bg-red-50 text-red-700 border-red-200",
};

function nextMastery(current: string): string {
  const i = (MASTERY_LEVELS as readonly string[]).indexOf(current);
  return MASTERY_LEVELS[(i + 1) % MASTERY_LEVELS.length];
}

const inputCls =
  "rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--gold-deep)]";

export default function TopicManager({
  courseId,
  topics,
}: {
  courseId: string;
  topics: TopicItem[];
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [confusionDrafts, setConfusionDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function patchTopic(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      await fetch(`/api/topics/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function addTopic(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusyId("new");
    try {
      await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, name }),
      });
      setNewName("");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function logConfusion(id: string) {
    const text = (confusionDrafts[id] ?? "").trim();
    if (!text) return;
    setConfusionDrafts((d) => ({ ...d, [id]: "" }));
    await patchTopic(id, { addConfusion: text });
  }

  async function deleteTopic(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/topics/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {topics.length === 0 ? (
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          No topics tracked yet — add what each week of class covers.
        </p>
      ) : (
        <ul className="mb-3 space-y-3">
          {topics.map((t) => (
            <li key={t.id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{t.name}</span>
                <button
                  type="button"
                  disabled={busyId === t.id}
                  onClick={() => patchTopic(t.id, { mastery: nextMastery(t.mastery) })}
                  title="Click to advance mastery"
                  className={clsx(
                    "inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide disabled:opacity-50",
                    MASTERY_STYLES[t.mastery] ?? MASTERY_STYLES.INTRODUCED,
                  )}
                >
                  {t.mastery.replace(/_/g, " ")}
                </button>
                {t.lastReviewedAt ? (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    reviewed{" "}
                    {new Date(t.lastReviewedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={busyId === t.id}
                  onClick={() => deleteTopic(t.id)}
                  className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--status-critical)] disabled:opacity-50"
                  aria-label={`Delete topic ${t.name}`}
                >
                  Delete
                </button>
              </div>

              {t.confusions.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {t.confusions.map((c, i) => (
                    <li key={i} className="text-xs italic text-[var(--text-secondary)]">
                      &ldquo;{c}&rdquo;
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2 flex gap-2">
                <input
                  className={`${inputCls} min-w-0 flex-1 text-xs`}
                  value={confusionDrafts[t.id] ?? ""}
                  onChange={(e) =>
                    setConfusionDrafts((d) => ({ ...d, [t.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      logConfusion(t.id);
                    }
                  }}
                  placeholder="What didn't I understand?"
                  aria-label={`Log confusion for ${t.name}`}
                />
                <button
                  type="button"
                  disabled={busyId === t.id}
                  onClick={() => logConfusion(t.id)}
                  className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--gold-deep)] hover:text-[var(--gold-deep)] disabled:opacity-50"
                >
                  Log
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addTopic} className="flex gap-2">
        <input
          className={`${inputCls} min-w-0 flex-1`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a topic — e.g. Recursion, Ch. 4 pointers"
          aria-label="New topic name"
        />
        <button
          type="submit"
          disabled={busyId === "new" || !newName.trim()}
          className="rounded-md bg-[var(--black)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
