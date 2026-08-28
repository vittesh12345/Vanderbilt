"use client";

// Generic controls shared by the Career / Research / Startup trackers:
// a status select and a delete button bound to any REST endpoint.

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function EntityStatusSelect({
  endpoint,
  id,
  status,
  options,
}: {
  endpoint: string; // e.g. "/api/career-items"
  id: string;
  status: string;
  options: readonly string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(value: string) {
    setBusy(true);
    try {
      await fetch(`${endpoint}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: value }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={status}
      onChange={(e) => change(e.target.value)}
      disabled={busy}
      className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-1.5 py-1 text-xs"
      aria-label="Status"
    >
      {options.map((s) => (
        <option key={s} value={s}>
          {s.replace(/_/g, " ").toLowerCase()}
        </option>
      ))}
    </select>
  );
}

export function EntityDelete({
  endpoint,
  id,
  confirmText = "Delete this item?",
}: {
  endpoint: string;
  id: string;
  confirmText?: string;
}) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        if (!window.confirm(confirmText)) return;
        await fetch(`${endpoint}/${id}`, { method: "DELETE" });
        router.refresh();
      }}
      className="text-[var(--text-muted)] hover:text-[var(--status-critical)]"
      aria-label="Delete"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/** Generic collapsed quick-add form posting JSON to an endpoint. */
export function QuickAdd({
  endpoint,
  buttonLabel,
  fields,
  extra,
}: {
  endpoint: string;
  buttonLabel: string;
  fields: {
    key: string;
    placeholder: string;
    type?: "text" | "date" | "select";
    options?: readonly string[];
    width?: string;
  }[];
  /** Constant fields merged into the payload. */
  extra?: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const inputCls =
    "rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--gold-deep)]";

  async function submit() {
    setBusy(true);
    try {
      const payload: Record<string, string> = { ...(extra ?? {}) };
      // A select the user never touched still shows its first option — send it.
      for (const f of fields) {
        const v = values[f.key] ?? (f.type === "select" ? f.options?.[0] : undefined);
        if (v) payload[f.key] = v;
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setValues({});
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-[var(--gold-deep)] hover:underline"
      >
        + {buttonLabel}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-[var(--border)] px-2.5 py-2">
      {fields.map((f) =>
        f.type === "select" ? (
          <select
            key={f.key}
            value={values[f.key] ?? f.options?.[0] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            className={inputCls}
          >
            {(f.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={f.key}
            type={f.type ?? "text"}
            placeholder={f.placeholder}
            value={values[f.key] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            className={`${inputCls} ${f.width ?? ""}`}
          />
        ),
      )}
      <button
        onClick={submit}
        disabled={busy}
        className="rounded-md bg-[var(--black)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        Add
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-[var(--text-muted)]">
        cancel
      </button>
    </div>
  );
}
