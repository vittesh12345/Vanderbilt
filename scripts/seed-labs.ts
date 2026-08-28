// Seed the research-lab tracker from researched data
// (scripts/data/vanderbilt-labs.json — official-source research with
// per-record provenance/confidence). Idempotent: labs match by professor +
// lab name; existing rows are untouched so your edits and pipeline status
// survive re-runs.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

interface ResearchLabRow {
  professor: string;
  labName?: string;
  department?: string;
  area?: string;
  website?: string;
  contactEmail?: string;
  acceptsUndergrads?: "YES" | "UNKNOWN";
  undergradEvidence?: string;
  skillsRelevant?: string;
  sourceUrl: string;
  confidence: "VERIFIED" | "LIKELY" | "UNVERIFIED";
  notes?: string;
  fitReason?: string;
  learnFirst?: string;
  couldOffer?: string;
  approach?: string;
  nextAction?: string;
}

async function main() {
  const raw = readFileSync(join(__dirname, "data", "vanderbilt-labs.json"), "utf8");
  const data = JSON.parse(raw) as { researchedAt: string; labs: ResearchLabRow[] };
  const verifiedAt = new Date(`${data.researchedAt}T12:00:00`);

  let created = 0;
  for (const l of data.labs) {
    const existing = await db.researchLab.findFirst({
      where: { professor: l.professor, labName: l.labName ?? null },
    });
    if (existing) continue;
    await db.researchLab.create({
      data: {
        professor: l.professor,
        labName: l.labName || null,
        department: l.department || null,
        area: l.area || null,
        website: l.website || null,
        contactEmail: l.contactEmail || null,
        acceptsUndergrads: l.acceptsUndergrads ?? "UNKNOWN",
        skillsRequired: l.skillsRelevant || null,
        fitReason: l.fitReason || null,
        learnFirst: l.learnFirst || null,
        couldOffer: l.couldOffer || null,
        approach: l.approach || null,
        nextAction: l.nextAction || null,
        status: "RESEARCHING",
        source: l.sourceUrl,
        confidence: l.confidence,
        lastVerifiedAt: l.confidence === "UNVERIFIED" ? null : verifiedAt,
      },
    });
    created++;
  }
  console.log(`Labs: +${created} (of ${data.labs.length}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
