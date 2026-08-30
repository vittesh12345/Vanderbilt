"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";

/** Dismisses a derived alert by persisting its stable key. */
export default function AlertDismiss({ alertKey }: { alertKey: string }) {
  const router = useRouter();

  async function dismiss() {
    await fetch("/api/alerts/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: alertKey }),
    });
    router.refresh();
  }

  return (
    <button
      onClick={dismiss}
      className="rounded p-1 text-[var(--text-muted)] hover:bg-neutral-100 hover:text-[var(--text-primary)]"
      aria-label="Dismiss alert"
      title="Dismiss"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
