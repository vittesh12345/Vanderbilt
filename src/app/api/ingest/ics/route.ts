// POST /api/ingest/ics — Brightspace/VSTAR calendar-feed intake, step 1.
//
// Accepts {url} (a personal iCal subscription URL the user copied from
// Brightspace — a legitimate, user-provided credentialless feed) or {icsText}
// (pasted .ics contents). Returns classified candidates matched to courses
// for the review step; nothing is written until /api/ingest/ics/commit.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classifyIcsEvents, parseIcs } from "@/lib/parsers/ics";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  let icsText = typeof body.icsText === "string" ? body.icsText : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";

  if (!icsText && url) {
    if (!/^https?:\/\//.test(url)) {
      return NextResponse.json({ error: "Invalid feed URL" }, { status: 400 });
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "text/calendar,*/*;q=0.8" },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      icsText = await res.text();
    } catch {
      return NextResponse.json(
        {
          error:
            "Could not fetch the feed from here (network policy or feed error). Open the URL in your browser and paste the .ics contents instead.",
        },
        { status: 502 },
      );
    }
  }

  if (!icsText || !/BEGIN:VEVENT/i.test(icsText)) {
    return NextResponse.json(
      { error: "No calendar events found — provide a feed URL or paste .ics contents." },
      { status: 400 },
    );
  }

  const events = parseIcs(icsText);
  const candidates = classifyIcsEvents(events);

  // Match detected course codes to real courses (case/space-insensitive).
  const courses = await db.course.findMany({
    select: { id: true, code: true },
  });
  const byCode = new Map(
    courses.map((c) => [c.code.replace(/\s+/g, "").toUpperCase(), c]),
  );

  const now = new Date();
  const horizon = new Date(now.getTime() + 180 * 24 * 3600_000);
  const out = candidates
    .filter((c) => c.at >= new Date(now.getTime() - 24 * 3600_000) && c.at <= horizon)
    .map((c) => ({
      ...c,
      at: c.at.toISOString(),
      endAt: c.endAt?.toISOString(),
      matchedCourseId: c.courseCode
        ? (byCode.get(c.courseCode.replace(/\s+/g, "").toUpperCase())?.id ?? null)
        : null,
    }));

  return NextResponse.json({
    total: candidates.length,
    inWindow: out.length,
    candidates: out,
    courses: courses.map((c) => ({ id: c.id, code: c.code })),
  });
}
