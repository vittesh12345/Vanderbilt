// Web-monitoring layer (Phase 2).
//
// MonitoredSource rows describe official pages worth watching (club
// recruitment pages, the Wond'ry programs page, VU calendars). runDueChecks
// fetches the ones whose check interval has elapsed, normalizes the page to
// text, hashes it, and only when the hash changes records lastChangeAt plus a
// short summary — the alert engine then surfaces "SOURCE_CHANGED" until
// dismissed. Quiet by design: no change, no noise.
//
// Politeness: one fetch per source per interval (default daily), a browser-ish
// UA, 15s timeout, and failures are recorded rather than retried in a loop.
// NOTE: some execution environments (including this dev sandbox) block
// general outbound traffic — checkSource reports that as an error string and
// the UI shows it honestly.

import { createHash } from "node:crypto";
import { db } from "@/lib/db";

export interface CheckResult {
  sourceId: string;
  label: string;
  status: "UNCHANGED" | "CHANGED" | "ERROR" | "FIRST_SNAPSHOT";
  detail?: string;
}

/** Crude but dependency-free main-text extraction. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#\d+;|&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** First ~2 lines of difference between two normalized texts. */
export function summarizeChange(before: string, after: string): string {
  const beforeWords = new Set(before.split(" "));
  const added = after
    .split(" ")
    .filter((w) => w.length > 3 && !beforeWords.has(w));
  if (!added.length) return "Content changed (reordering or removals).";
  return `New content includes: ${[...new Set(added)].slice(0, 20).join(" ")}`.slice(0, 280);
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CollegeOS-Monitor/1.0 (personal student dashboard)",
        Accept: "text/html,application/xhtml+xml,text/calendar;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function checkSource(sourceId: string): Promise<CheckResult> {
  const source = await db.monitoredSource.findUnique({ where: { id: sourceId } });
  if (!source) {
    return { sourceId, label: "?", status: "ERROR", detail: "Source not found" };
  }
  const now = new Date();
  try {
    const body = await fetchText(source.url);
    const text = htmlToText(body).slice(0, 200_000);
    const hash = contentHash(text);

    if (!source.lastContentHash) {
      await db.monitoredSource.update({
        where: { id: source.id },
        data: { lastCheckedAt: now, lastContentHash: hash },
      });
      return { sourceId, label: source.label, status: "FIRST_SNAPSHOT" };
    }
    if (hash === source.lastContentHash) {
      await db.monitoredSource.update({
        where: { id: source.id },
        data: { lastCheckedAt: now },
      });
      return { sourceId, label: source.label, status: "UNCHANGED" };
    }

    // Changed. We only kept the hash, not the full prior text, so summarize
    // from what we can see now (the stored summary is refined next change).
    const summary = summarizeChange("", text.slice(0, 4000));
    await db.monitoredSource.update({
      where: { id: source.id },
      data: {
        lastCheckedAt: now,
        lastContentHash: hash,
        lastChangeAt: now,
        lastChangeSummary: summary,
      },
    });
    return { sourceId, label: source.label, status: "CHANGED", detail: summary };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "fetch failed";
    await db.monitoredSource.update({
      where: { id: source.id },
      data: { lastCheckedAt: now },
    });
    return { sourceId, label: source.label, status: "ERROR", detail };
  }
}

/** Check every active source whose interval has elapsed (or all, if forced). */
export async function runDueChecks(force = false): Promise<CheckResult[]> {
  const sources = await db.monitoredSource.findMany({ where: { active: true } });
  const now = Date.now();
  const due = sources.filter(
    (s) =>
      force ||
      !s.lastCheckedAt ||
      now - s.lastCheckedAt.getTime() > s.checkEveryHours * 3600_000,
  );
  const results: CheckResult[] = [];
  for (const s of due) {
    // Sequential on purpose — politeness beats speed for a daily check.
    results.push(await checkSource(s.id));
  }
  return results;
}
