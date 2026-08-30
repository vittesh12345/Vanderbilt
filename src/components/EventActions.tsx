"use client";

// Delete control for a standalone CalendarEvent (agenda list). Classes, exams,
// due dates, and sessions are derived entries managed at their source — only
// EVENT rows are deletable here.

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function EventActions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Remove this event from the calendar?")) return;
    setBusy(true);
    try {
      await fetch(`/api/events/${eventId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      className="shrink-0 rounded p-1 text-[var(--text-muted)] opacity-60 hover:bg-neutral-100 hover:text-[var(--status-critical)] hover:opacity-100"
      aria-label="Delete event"
      title="Delete event"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
