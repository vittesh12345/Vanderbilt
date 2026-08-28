"use client";

// Create/edit a club record. On edit also carries Delete.

import { useRouter } from "next/navigation";
import { useState } from "react";

const CATEGORIES = [
  "FINANCE",
  "CONSULTING",
  "TECH",
  "ENTREPRENEURSHIP",
  "AI",
  "BUSINESS",
  "VC_PE",
  "PRODUCT",
  "OTHER",
] as const;

export interface ClubInitial {
  name: string;
  category: string;
  description: string;
  website: string;
  applicationUrl: string;
  meetingInfo: string;
  recruitment: string;
  interviewProcess: string;
  requirements: string;
  contact: string;
  source: string;
}

const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--gold-deep)]";
const labelCls =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";

export default function ClubForm({
  clubId,
  initial,
}: {
  clubId?: string;
  initial?: ClubInitial;
}) {
  const router = useRouter();
  const editing = Boolean(clubId);
  const [form, setForm] = useState<ClubInitial>(
    initial ?? {
      name: "",
      category: "OTHER",
      description: "",
      website: "",
      applicationUrl: "",
      meetingInfo: "",
      recruitment: "",
      interviewProcess: "",
      requirements: "",
      contact: "",
      source: "",
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ClubInitial>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Club name is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/clubs/${clubId}` : "/api/clubs", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save the club.");
        return;
      }
      const club = await res.json();
      router.push(`/clubs/${editing ? clubId : club.id}`);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!clubId) return;
    if (!window.confirm("Delete this club and its applications?")) return;
    setBusy(true);
    await fetch(`/api/clubs/${clubId}`, { method: "DELETE" });
    router.push("/clubs");
    router.refresh();
  }

  const fields: {
    key: keyof ClubInitial;
    label: string;
    textarea?: boolean;
  }[] = [
    { key: "description", label: "Description", textarea: true },
    { key: "website", label: "Website / AnchorLink URL" },
    { key: "applicationUrl", label: "Application URL" },
    { key: "meetingInfo", label: "Meetings (time & place)" },
    { key: "recruitment", label: "Recruitment period / process", textarea: true },
    { key: "interviewProcess", label: "Interview process" },
    { key: "requirements", label: "Membership requirements" },
    { key: "contact", label: "Contact" },
    { key: "source", label: "Source (where this info came from)" },
  ];

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Club name *</label>
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <select
            className={inputCls}
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, "/").toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>
      {fields.map((f) => (
        <div key={f.key}>
          <label className={labelCls}>{f.label}</label>
          {f.textarea ? (
            <textarea
              className={inputCls}
              rows={2}
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
          ) : (
            <input
              className={inputCls}
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--black)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {editing ? "Save changes" : "Add club"}
        </button>
        {editing ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--status-critical)] hover:border-[var(--status-critical)]"
          >
            Delete club
          </button>
        ) : null}
      </div>
    </form>
  );
}
