// Club recommendation engine.
//
// Ranks clubs HIGH / MEDIUM / LOW against the student's declared interests,
// priority tiers, and active goals — with a stated reason, never a bare rank.
// Deliberately transparent: keyword affinity between the club's category/
// description and the student's profile, not a black box.

export interface ClubForRanking {
  id: string;
  name: string;
  category: string; // FINANCE | CONSULTING | TECH | ENTREPRENEURSHIP | AI | BUSINESS | VC_PE | PRODUCT | OTHER
  description?: string | null;
  membership: string; // PROSPECT | INTERESTED | MEMBER | LEADER | ALUMNI | NOT_PURSUING
}

export interface RankingProfile {
  interests: string[]; // e.g. ["finance", "AI", "startups"]
  /** Personal tier categories, e.g. tier1: ["ACADEMIC","STARTUP","CAREER"]. */
  tier1?: string[];
  tier2?: string[];
  goals?: { category: string; title: string }[];
}

export interface ClubRanking {
  id: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  score: number;
  reason: string;
}

// Which interest keywords light up each club category.
const CATEGORY_AFFINITY: Record<string, string[]> = {
  FINANCE: ["finance", "investment", "investing", "markets", "trading", "banking"],
  VC_PE: ["venture capital", "vc", "private equity", "pe", "investing", "startups", "finance"],
  CONSULTING: ["consulting", "strategy", "case", "problem solving", "business"],
  TECH: ["technology", "tech", "computer science", "cs", "software", "programming", "engineering", "product"],
  AI: ["ai", "artificial intelligence", "machine learning", "ml", "data science", "computer science"],
  ENTREPRENEURSHIP: ["startup", "startups", "entrepreneurship", "founder", "innovation", "venture capital", "product"],
  BUSINESS: ["business", "finance", "consulting", "strategy", "product"],
  PRODUCT: ["product", "tech", "startups", "business", "strategy"],
  OTHER: [],
};

// Club category → the personal-priority tier category it advances.
const CATEGORY_TO_TIER: Record<string, string> = {
  FINANCE: "CAREER",
  VC_PE: "CAREER",
  CONSULTING: "CAREER",
  BUSINESS: "CAREER",
  PRODUCT: "CAREER",
  TECH: "CAREER",
  AI: "CAREER",
  ENTREPRENEURSHIP: "STARTUP",
  OTHER: "PERSONAL",
};

function norm(s: string): string {
  return s.toLowerCase();
}

export function rankClub(
  club: ClubForRanking,
  profile: RankingProfile,
): ClubRanking {
  const interests = profile.interests.map(norm);
  const affinities = CATEGORY_AFFINITY[club.category] ?? [];
  const desc = norm(club.description ?? "");

  let score = 0;
  const reasons: string[] = [];

  // Category ↔ interest affinity (the main signal).
  const categoryHits = interests.filter((i) =>
    affinities.some((a) => a.includes(i) || i.includes(a)),
  );
  if (categoryHits.length) {
    // The first direct interest↔category hit is the primary signal; extra
    // hits add a little. (30 + 15 tier-1 alignment clears the HIGH bar — a
    // finance club IS high priority for a finance-first student.)
    score += Math.min(40, 30 + (categoryHits.length - 1) * 8);
    reasons.push(
      `strong alignment with your ${[...new Set(categoryHits)].slice(0, 3).join("/")} interest${categoryHits.length > 1 ? "s" : ""}`,
    );
  }

  // Description mentions an interest directly.
  const descHits = interests.filter((i) => i.length >= 2 && desc.includes(i));
  if (descHits.length) {
    score += Math.min(15, descHits.length * 5);
    if (!categoryHits.length)
      reasons.push(`its focus mentions ${descHits.slice(0, 2).join(" and ")}`);
  }

  // Personal tier alignment: does the club advance a tier-1/2 life category?
  const tierCategory = CATEGORY_TO_TIER[club.category] ?? "PERSONAL";
  if (profile.tier1?.includes(tierCategory)) {
    score += 15;
    reasons.push(`advances a tier-1 priority (${tierCategory.toLowerCase()})`);
  } else if (profile.tier2?.includes(tierCategory)) {
    score += 7;
  }

  // Goal overlap: an active goal in the same territory.
  const goalHit = (profile.goals ?? []).find(
    (g) =>
      g.category === tierCategory ||
      affinities.some((a) => norm(g.title).includes(a)),
  );
  if (goalHit) {
    score += 10;
    reasons.push(`supports your goal "${goalHit.title}"`);
  }

  // Already a member/leader: keep visible but don't compete with prospects.
  if (club.membership === "MEMBER" || club.membership === "LEADER") {
    reasons.push("already a member");
  }
  if (club.membership === "NOT_PURSUING") {
    score = Math.min(score, 10);
    reasons.push("marked not pursuing");
  }

  const priority = score >= 45 ? "HIGH" : score >= 22 ? "MEDIUM" : "LOW";
  return {
    id: club.id,
    priority,
    score,
    reason: reasons.length
      ? reasons.slice(0, 3).join("; ")
      : "no strong overlap with your stated interests right now",
  };
}

export function rankClubs(
  clubs: ClubForRanking[],
  profile: RankingProfile,
): Map<string, ClubRanking> {
  return new Map(clubs.map((c) => [c.id, rankClub(c, profile)]));
}
