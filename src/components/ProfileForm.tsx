"use client";

// Edits the single Profile row: identity, weekly hour budget, majors and
// interests (comma-separated → arrays), and the personal priority tiers the
// ranking engine reads. PATCHes /api/profile, then router.refresh() with a
// transient "Saved" indicator.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PriorityTiers } from "@/lib/types";

const CATEGORIES = [
  "ACADEMIC",
  "STARTUP",
  "CAREER",
  "RESEARCH",
  "CLUB",
  "PERSONAL",
] as const;
type Category = (typeof CATEGORIES)[number];
type TierChoice = "1" | "2" | "3";

const CATEGORY_HINTS: Record<Category, string> = {
  ACADEMIC: "Courses, assignments, exam prep",
  STARTUP: "Your venture — tasks, funding, programs",
  CAREER: "Recruiting, applications, networking",
  RESEARCH: "Lab outreach and research work",
  CLUB: "Club applications, meetings, leadership",
  PERSONAL: "Everything else on your plate",
};

export interface ProfileFormInitial {
  name: string;
  email: string;
  gradYear: number | null;
  weeklyHours: number;
  majors: string[];
  interests: string[];
  tiers: PriorityTiers;
}

const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--gold-deep)]";
const labelCls =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";

function initialTierMap(tiers: PriorityTiers): Record<Category, TierChoice> {
  const map = {} as Record<Category, TierChoice>;
  for (const cat of CATEGORIES) {
    // Defensive: tiersJson may be `{}` in the DB, so the arrays can be absent.
    map[cat] = tiers.tier1?.includes(cat)
      ? "1"
      : tiers.tier2?.includes(cat)
        ? "2"
        : tiers.tier3?.includes(cat)
          ? "3"
          : "2";
  }
  return map;
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ProfileForm({ initial }: { initial: ProfileFormInitial }) {
  const router = useRouter();

  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [gradYear, setGradYear] = useState(
    initial.gradYear != null ? String(initial.gradYear) : "",
  );
  const [weeklyHours, setWeeklyHours] = useState(String(initial.weeklyHours));
  const [majors, setMajors] = useState(initial.majors.join(", "));
  const [interests, setInterests] = useState(initial.interests.join(", "));
  const [tierMap, setTierMap] = useState<Record<Category, TierChoice>>(() =>
    initialTierMap(initial.tiers),
  );

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const hours = Math.round(Number(weeklyHours));
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
      setError("Weekly hours must be a number between 1 and 168.");
      return;
    }

    const tiers: PriorityTiers = { tier1: [], tier2: [], tier3: [] };
    for (const cat of CATEGORIES) {
      const key = `tier${tierMap[cat]}` as keyof PriorityTiers;
      tiers[key].push(cat);
    }

    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          gradYear: gradYear.trim() ? Number(gradYear) : null,
          weeklyHours: hours,
          majors: splitList(majors),
          interests: splitList(interests),
          tiers,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong saving your profile.");
        return;
      }
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="profile-name">
            Name *
          </label>
          <input
            id="profile-name"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="profile-email">
            Email
          </label>
          <input
            id="profile-email"
            type="email"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@vanderbilt.edu"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="profile-grad-year">
            Graduation year
          </label>
          <input
            id="profile-grad-year"
            type="number"
            min={2020}
            max={2040}
            className={inputCls}
            value={gradYear}
            onChange={(e) => setGradYear(e.target.value)}
            placeholder="2029"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="profile-weekly-hours">
            Weekly work hours
          </label>
          <input
            id="profile-weekly-hours"
            type="number"
            min={1}
            max={168}
            className={inputCls}
            value={weeklyHours}
            onChange={(e) => setWeeklyHours(e.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Hours outside class you can work each week — the scheduler plans
            against this.
          </p>
        </div>
        <div>
          <label className={labelCls} htmlFor="profile-majors">
            Majors
          </label>
          <input
            id="profile-majors"
            className={inputCls}
            value={majors}
            onChange={(e) => setMajors(e.target.value)}
            placeholder="Computer Science, Economics"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">Comma-separated.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="profile-interests">
            Interests
          </label>
          <input
            id="profile-interests"
            className={inputCls}
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="finance, AI, startups"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">Comma-separated.</p>
        </div>
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        Priority tiers
      </h3>
      <p className="mb-2 text-xs text-[var(--text-secondary)]">
        Assign each life category to a tier. Tier 1 work gets a real boost in
        the daily rankings; Tier 3 never disappears — it just wins fewer
        tie-breaks.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              <th className="pb-1.5 pr-3 font-semibold">Category</th>
              <th className="hidden pb-1.5 pr-3 font-semibold sm:table-cell">
                Covers
              </th>
              <th className="pb-1.5 font-semibold">Tier</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat} className="border-t border-[var(--border)]">
                <td className="py-1.5 pr-3 font-medium">
                  {cat.charAt(0) + cat.slice(1).toLowerCase()}
                </td>
                <td className="hidden py-1.5 pr-3 text-xs text-[var(--text-secondary)] sm:table-cell">
                  {CATEGORY_HINTS[cat]}
                </td>
                <td className="py-1.5">
                  <select
                    className={`${inputCls} w-32`}
                    value={tierMap[cat]}
                    onChange={(e) =>
                      setTierMap((m) => ({
                        ...m,
                        [cat]: e.target.value as TierChoice,
                      }))
                    }
                    aria-label={`Priority tier for ${cat.toLowerCase()}`}
                  >
                    <option value="1">Tier 1 — top</option>
                    <option value="2">Tier 2</option>
                    <option value="3">Tier 3</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--black)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save profile"}
        </button>
        <span
          aria-live="polite"
          className={
            saved
              ? "text-sm font-medium text-[var(--status-good)] transition-opacity"
              : "text-sm font-medium opacity-0 transition-opacity"
          }
        >
          Saved
        </span>
      </div>
    </form>
  );
}
