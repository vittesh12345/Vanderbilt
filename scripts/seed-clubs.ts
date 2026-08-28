// Seed the Vanderbilt club database from researched data
// (scripts/data/vanderbilt-clubs.json — gathered from official sources, with
// per-record provenance and confidence; see the file's "note").
//
// Idempotent: clubs match by name, monitored sources by URL, startup programs
// by title — existing rows are left alone so your edits survive re-runs.
//
// Also seeds the two time-sensitive REAL deadlines found during research
// (verify on the official pages before relying on them):
//   - Wond'ry IMPACT application — September 1, 2026
//   - Vanderbilt Investment Banking Club Fall 2026 apps — September 14, 2026

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

interface ResearchClub {
  name: string;
  category: string;
  description: string;
  website?: string;
  applicationInfo?: string;
  meetingInfo?: string;
  contact?: string;
  sourceUrl: string;
  confidence: "VERIFIED" | "LIKELY" | "UNVERIFIED";
  notes?: string;
}

interface ResearchData {
  researchedAt: string;
  clubs: ResearchClub[];
  startupPrograms: ResearchClub[];
  monitors: { url: string; label: string; kind: string }[];
}

async function main() {
  const raw = readFileSync(
    join(__dirname, "data", "vanderbilt-clubs.json"),
    "utf8",
  );
  const data = JSON.parse(raw) as ResearchData;
  const verifiedAt = new Date(`${data.researchedAt}T12:00:00`);

  let clubsCreated = 0;
  for (const c of data.clubs) {
    const existing = await db.club.findFirst({ where: { name: c.name } });
    if (existing) continue;
    await db.club.create({
      data: {
        name: c.name,
        category: c.category,
        description: c.description ?? null,
        website: c.website || null,
        meetingInfo: c.meetingInfo || null,
        recruitment: c.applicationInfo || null,
        contact: c.contact || null,
        source: c.sourceUrl,
        confidence: c.confidence,
        // Only a directly-read or official-domain-sourced record counts as
        // checked on the research date; UNVERIFIED rows stay unstamped.
        lastVerifiedAt: c.confidence === "UNVERIFIED" ? null : verifiedAt,
      },
    });
    clubsCreated++;
  }

  let programsCreated = 0;
  for (const p of data.startupPrograms) {
    const existing = await db.startupItem.findFirst({ where: { title: p.name } });
    if (existing) continue;
    await db.startupItem.create({
      data: {
        kind: /competition|pitch/i.test(p.name) ? "COMPETITION" : "PROGRAM",
        title: p.name,
        details: p.description ?? null,
        provider: "The Wond'ry / Vanderbilt",
        relevance:
          "Vanderbilt startup resource — commercialization, mentorship, or funding for your venture.",
        nextAction: p.applicationInfo || null,
        url: p.website || p.sourceUrl,
        source: p.sourceUrl,
        status: "WATCHING",
        lastVerifiedAt: p.confidence === "UNVERIFIED" ? null : verifiedAt,
      },
    });
    programsCreated++;
  }

  let monitorsCreated = 0;
  for (const m of data.monitors) {
    await db.monitoredSource.upsert({
      where: { url: m.url },
      create: { url: m.url, label: m.label, kind: m.kind, checkEveryHours: 24 },
      update: {},
    });
    monitorsCreated++;
  }

  // ---- Real time-sensitive deadlines found in research -------------------
  const year = 2026;
  const impactDeadline = new Date(year, 8, 1, 23, 59); // Sept 1, 2026
  const vibcDeadline = new Date(year, 8, 14, 23, 59); // Sept 14, 2026
  const now = new Date();

  if (impactDeadline > now) {
    const exists = await db.calendarEvent.findFirst({
      where: { title: { contains: "IMPACT" } },
    });
    if (!exists) {
      await db.calendarEvent.create({
        data: {
          title: "Wond'ry IMPACT program application deadline",
          category: "STARTUP",
          startAt: impactDeadline,
          description:
            "Strong fit for startup commercialization. Deadline per the Wond'ry site as of the research date — verify before submitting.",
          source: "OTHER",
          sourceUrl: "https://www.vanderbilt.edu/the-wondry/impact-program/",
          lastVerifiedAt: verifiedAt,
        },
      });
    }
  }

  const vibc = await db.club.findFirst({
    where: { name: { contains: "Investment Banking" } },
  });
  if (vibc && vibcDeadline > now) {
    const existing = await db.clubApplication.findFirst({
      where: { clubId: vibc.id, cycle: "Fall 2026" },
    });
    if (!existing) {
      await db.clubApplication.create({
        data: {
          clubId: vibc.id,
          cycle: "Fall 2026",
          deadlineAt: vibcDeadline,
          status: "OPEN",
          notes:
            "Deadline per vanderbiltibc.org search snippet (Sept 14, 2026, 11:59 PM CT) — verify on the site.",
        },
      });
    }
  }

  console.log(
    `Clubs: +${clubsCreated} (of ${data.clubs.length}) · Startup programs: +${programsCreated} · Monitored sources: ${monitorsCreated} upserted · deadlines wired.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
