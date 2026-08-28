"use client";

// Create form for standalone calendar events (CalendarEvent rows). POSTs to
// /api/events then router.refresh(). AddEventButton is the disclosure the
// calendar page mounts in its header: it toggles the form inline at the top.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EVENT_CATEGORIES } from "@/lib/types";

const labelCls =
  "block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";
const inputCls =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm focus:border-[var(--gold-deep)] focus:outline-none";

export default function EventForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("PERSONAL");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Give the event a title.");
      return;
    }
    if (!date) {
      setError("Set the event date.");
      return;
    }

    const startAt = new Date(`${date}T${startTime || "09:00"}`);
    if (isNaN(startAt.getTime())) {
      setError("Invalid date/time.");
      return;
    }
    const endAt = endTime ? new Date(`${date}T${endTime}`) : null;
    if (endAt && (isNaN(endAt.getTime()) || endAt < startAt)) {
      setError("End time must come after the start time.");
      return;
    }

    const payload = {
      title: title.trim(),
      category,
      startAt: startAt.toISOString(),
      endAt: endAt ? endAt.toISOString() : null,
      location: location.trim() || null,
      url: url.trim() || null,
      description: description.trim() || null,
      source: source.trim() || null, // API defaults to MANUAL
    };

    setBusy(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Something went wrong saving the event.");
        return;
      }
      setTitle("");
      setDate("");
      setStartTime("");
      setEndTime("");
      setLocation("");
      setUrl("");
      setDescription("");
      setSource("");
      router.refresh();
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 text-left shadow-sm"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="evf-title">Title</label>
          <input
            id="evf-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Coffee chat with VandyHacks lead"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="evf-category">Category</label>
          <select
            id="evf-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputCls}
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="evf-date">Date</label>
          <input
            id="evf-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <label className={labelCls} htmlFor="evf-start">Start time</label>
              <input
                id="evf-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex-1">
              <label className={labelCls} htmlFor="evf-end">End time</label>
              <input
                id="evf-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            End time optional. Blank start defaults to 9:00 AM.
          </p>
        </div>

        <div>
          <label className={labelCls} htmlFor="evf-location">Location</label>
          <input
            id="evf-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Student Life Center"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="evf-url">Link</label>
          <input
            id="evf-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://anchorlink.vanderbilt.edu/…"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="evf-description">Description</label>
          <textarea
            id="evf-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What it is, why it matters, what to bring…"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="evf-source">Source label</label>
          <input
            id="evf-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Optional — e.g. ANCHORLINK, VU_CALENDAR (defaults to MANUAL)"
            className={inputCls}
          />
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm font-medium text-[var(--status-critical)]">{error}</p>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--gold-deep)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Add event"}
        </button>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="text-sm font-medium text-[var(--text-secondary)] hover:underline"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** Header disclosure: a compact "Add event" button that toggles the form
 *  open inline at the top of the page (used by /calendar's PageHeader). */
export function AddEventButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-end gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md bg-[var(--gold-deep)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
      >
        {open ? "Close" : "+ Add event"}
      </button>
      {open ? (
        <div className="w-[38rem] max-w-[85vw]">
          <EventForm onDone={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
