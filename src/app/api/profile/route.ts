// Profile settings endpoint. Single-user system → single Profile row:
// PATCH upserts it (findFirst; create when the seed hasn't run).
// Arrays (majors, interests) and the priority tiers arrive as JSON values
// and are stored serialized via toJson.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { EVENT_CATEGORIES, type PriorityTiers } from "@/lib/types";

function cleanStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Sanitize the tier assignment: only known categories survive, and each
 * category lands in at most one tier (first mention wins, tier 1 → 3).
 */
function cleanTiers(value: unknown): PriorityTiers | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const valid = new Set<string>(EVENT_CATEGORIES);
  const seen = new Set<string>();
  const pick = (key: "tier1" | "tier2" | "tier3"): string[] => {
    const out: string[] = [];
    for (const entry of cleanStringArray(raw[key]) ?? []) {
      const cat = entry.toUpperCase();
      if (!valid.has(cat) || seen.has(cat)) continue;
      seen.add(cat);
      out.push(cat);
    }
    return out;
  };
  return { tier1: pick("tier1"), tier2: pick("tier2"), tier3: pick("tier3") };
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: {
    name?: string;
    email?: string | null;
    gradYear?: number | null;
    weeklyHours?: number;
    majorsJson?: string;
    interestsJson?: string;
    tiersJson?: string;
  } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 },
      );
    }
    data.name = body.name.trim();
  }

  if (body.email !== undefined) {
    if (body.email === null || body.email === "") {
      data.email = null;
    } else if (typeof body.email === "string") {
      data.email = body.email.trim();
    } else {
      return NextResponse.json(
        { error: "email must be a string or null" },
        { status: 400 },
      );
    }
  }

  if (body.gradYear !== undefined) {
    if (body.gradYear === null || body.gradYear === "") {
      data.gradYear = null;
    } else {
      const year = Math.round(Number(body.gradYear));
      if (!Number.isFinite(year) || year < 1900 || year > 2200) {
        return NextResponse.json(
          { error: "gradYear must be a plausible year" },
          { status: 400 },
        );
      }
      data.gradYear = year;
    }
  }

  if (body.weeklyHours !== undefined) {
    const hours = Math.round(Number(body.weeklyHours));
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
      return NextResponse.json(
        { error: "weeklyHours must be between 1 and 168" },
        { status: 400 },
      );
    }
    data.weeklyHours = hours;
  }

  if (body.majors !== undefined) {
    const majors = cleanStringArray(body.majors);
    if (majors === null) {
      return NextResponse.json(
        { error: "majors must be an array of strings" },
        { status: 400 },
      );
    }
    data.majorsJson = toJson(majors);
  }

  if (body.interests !== undefined) {
    const interests = cleanStringArray(body.interests);
    if (interests === null) {
      return NextResponse.json(
        { error: "interests must be an array of strings" },
        { status: 400 },
      );
    }
    data.interestsJson = toJson(interests);
  }

  if (body.tiers !== undefined) {
    const tiers = cleanTiers(body.tiers);
    if (tiers === null) {
      return NextResponse.json(
        { error: "tiers must be { tier1, tier2, tier3 } of category arrays" },
        { status: 400 },
      );
    }
    data.tiersJson = toJson(tiers);
  }

  const existing = await db.profile.findFirst();
  const profile = existing
    ? await db.profile.update({ where: { id: existing.id }, data })
    : await db.profile.create({
        data: {
          name: data.name ?? "Student",
          email: data.email ?? null,
          gradYear: data.gradYear ?? null,
          weeklyHours: data.weeklyHours ?? 40,
          majorsJson: data.majorsJson ?? "[]",
          interestsJson: data.interestsJson ?? "[]",
          tiersJson: data.tiersJson ?? "{}",
        },
      });

  return NextResponse.json(profile);
}
