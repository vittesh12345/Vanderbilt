"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Checkbox that marks a planned work session complete (or un-complete). */
export default function SessionCheck({
  sessionId,
  completed,
}: {
  sessionId: string;
  completed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !completed }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <input
      type="checkbox"
      checked={completed}
      onChange={toggle}
      disabled={busy}
      className="h-4 w-4 accent-[var(--gold-deep)]"
      aria-label="Mark session complete"
    />
  );
}
