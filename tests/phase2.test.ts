// Phase 2 engine tests: club ranking, ICS parsing/classification, monitoring
// helpers, and the alert-engine extensions (club applications, changed
// sources).

import { describe, expect, it } from "vitest";
import { rankClub, rankClubs } from "@/lib/engine/clubrank";
import { classifyIcsEvents, parseIcs, parseIcsDate } from "@/lib/parsers/ics";
import { contentHash, htmlToText, summarizeChange } from "@/lib/monitor";
import { computeAlerts } from "@/lib/engine/alerts";

const NOW = new Date("2026-09-14T09:00:00");

describe("clubrank", () => {
  const profile = {
    interests: ["finance", "startups", "AI"],
    tier1: ["ACADEMIC", "STARTUP", "CAREER"],
    tier2: ["RESEARCH", "CLUB"],
    goals: [{ category: "STARTUP", title: "Validate my startup problem" }],
  };

  it("ranks a finance club HIGH for a finance-interested student, with a reason", () => {
    const r = rankClub(
      {
        id: "1",
        name: "Investment Club",
        category: "FINANCE",
        description: "Student-managed investment fund",
        membership: "PROSPECT",
      },
      profile,
    );
    expect(r.priority).toBe("HIGH");
    expect(r.reason).toMatch(/finance/i);
  });

  it("ranks an unrelated club LOW with an honest reason", () => {
    const r = rankClub(
      {
        id: "2",
        name: "A cappella group",
        category: "OTHER",
        description: "Singing on the quad",
        membership: "PROSPECT",
      },
      profile,
    );
    expect(r.priority).toBe("LOW");
    expect(r.reason.length).toBeGreaterThan(5);
  });

  it("caps NOT_PURSUING clubs at LOW even with strong affinity", () => {
    const r = rankClub(
      {
        id: "3",
        name: "Finance Society",
        category: "FINANCE",
        description: "finance finance finance",
        membership: "NOT_PURSUING",
      },
      profile,
    );
    expect(r.priority).toBe("LOW");
    expect(r.reason).toMatch(/not pursuing/);
  });

  it("credits goal overlap for entrepreneurship clubs", () => {
    const r = rankClub(
      {
        id: "4",
        name: "VINES",
        category: "ENTREPRENEURSHIP",
        description: "Innovation and entrepreneurship society",
        membership: "PROSPECT",
      },
      profile,
    );
    expect(r.priority).toBe("HIGH");
    expect(r.reason).toMatch(/goal|tier-1|startup/i);
  });

  it("rankClubs maps every club", () => {
    const map = rankClubs(
      [
        { id: "a", name: "X", category: "TECH", description: "", membership: "PROSPECT" },
        { id: "b", name: "Y", category: "OTHER", description: "", membership: "PROSPECT" },
      ],
      profile,
    );
    expect(map.size).toBe(2);
  });
});

describe("ics parser", () => {
  const FEED = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:1@brightspace",
    "SUMMARY:CS 1101 - Problem Set 3 - Due",
    "DTSTART;VALUE=DATE:20260925",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:2@brightspace",
    "SUMMARY:BSCI 1510 Midterm 1",
    "DTSTART:20260923T190000Z",
    "DTEND:20260923T210000Z",
    "LOCATION:Stevenson 4309",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:3@brightspace",
    "SUMMARY:Quiz 2 - Limits",
    "CATEGORIES:MATH 1301",
    "DTSTART:20260918T143000",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:4@x",
    "SUMMARY:Guest lecture: entrepreneurship \\, innovation",
    "DTSTART:20260930T170000",
    // RFC 5545 folding: the continuation line's FIRST space is the fold
    // marker (removed on unfold); the second is the real word separator.
    "DESCRIPTION:Long text that wraps",
    "  onto a continuation line",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("parses events, folded lines, escapes, and date forms", () => {
    const events = parseIcs(FEED);
    expect(events).toHaveLength(4);
    expect(events[0].allDay).toBe(true);
    expect(events[0].start.getDate()).toBe(25);
    expect(events[1].start.toISOString()).toBe("2026-09-23T19:00:00.000Z");
    expect(events[3].summary).toContain("entrepreneurship , innovation");
    expect(events[3].description).toBe("Long text that wraps onto a continuation line");
  });

  it("classifies kinds and extracts course codes", () => {
    const cands = classifyIcsEvents(parseIcs(FEED));
    expect(cands[0].kind).toBe("ASSIGNMENT");
    expect(cands[0].courseCode).toBe("CS 1101");
    expect(cands[0].title).toBe("Problem Set 3");
    expect(cands[1].kind).toBe("EXAM");
    expect(cands[1].courseCode).toBe("BSCI 1510");
    expect(cands[2].kind).toBe("QUIZ");
    expect(cands[2].courseCode).toBe("MATH 1301");
    expect(cands[3].kind).toBe("EVENT");
  });

  it("parseIcsDate handles date-only, floating, and UTC forms", () => {
    expect(parseIcsDate("20261014")?.allDay).toBe(true);
    expect(parseIcsDate("20261014T140000")?.date.getHours()).toBe(14);
    expect(parseIcsDate("20261014T140000Z")?.date.toISOString()).toBe(
      "2026-10-14T14:00:00.000Z",
    );
    expect(parseIcsDate("garbage")).toBeNull();
  });
});

describe("monitor helpers", () => {
  it("htmlToText strips scripts/styles/tags", () => {
    const text = htmlToText(
      "<html><script>evil()</script><style>.x{}</style><body><h1>Apply now</h1><p>Deadline &amp; details</p></body></html>",
    );
    expect(text).toBe("Apply now Deadline & details");
  });

  it("contentHash is stable and sensitive", () => {
    expect(contentHash("a")).toBe(contentHash("a"));
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });

  it("summarizeChange surfaces new words", () => {
    const s = summarizeChange("old page content", "old page content applications open september");
    expect(s).toMatch(/applications|september/);
  });
});

describe("alert engine phase-2 extensions", () => {
  const base = {
    now: NOW,
    assignments: [],
    exams: [],
    tasks: [],
    openConflicts: [],
    heavyWeeks: [],
    needsReviewTopics: [],
  };

  it("announces applications opening within 7 days", () => {
    const alerts = computeAlerts({
      ...base,
      clubApplications: [
        {
          id: "a1",
          clubName: "Consulting Club",
          status: "NOT_OPEN",
          opensAt: new Date("2026-09-19T09:00:00"),
          deadlineAt: null,
          interviewAt: null,
        },
      ],
    });
    const opens = alerts.find((a) => a.kind === "APP_OPENS");
    expect(opens).toBeDefined();
    expect(opens!.title).toMatch(/opens in 5 days/);
  });

  it("applies deadline tiers to active applications but not submitted ones", () => {
    const mk = (status: string, id: string) => ({
      id,
      clubName: "VIBC",
      status,
      opensAt: null,
      deadlineAt: new Date("2026-09-15T23:59:00"),
      interviewAt: null,
    });
    const alerts = computeAlerts({
      ...base,
      clubApplications: [mk("OPEN", "x"), mk("SUBMITTED", "y")],
    });
    const deadlineAlerts = alerts.filter((a) => a.title.includes("VIBC"));
    expect(deadlineAlerts).toHaveLength(1);
    expect(deadlineAlerts[0].kind).toBe("DEADLINE_1D");
  });

  it("raises interview-prep alerts within 4 days for INTERVIEW status", () => {
    const alerts = computeAlerts({
      ...base,
      clubApplications: [
        {
          id: "i1",
          clubName: "CCG",
          status: "INTERVIEW",
          opensAt: null,
          deadlineAt: null,
          interviewAt: new Date("2026-09-16T17:00:00"),
        },
      ],
    });
    expect(alerts.some((a) => a.title.match(/CCG interview/))).toBe(true);
  });

  it("surfaces changed monitored sources as INFO alerts with stable keys", () => {
    const alerts = computeAlerts({
      ...base,
      changedSources: [
        {
          id: "s1",
          label: "VIBC application page",
          changedAt: new Date("2026-09-13T08:00:00"),
          summary: "New content includes: applications september deadline",
        },
      ],
    });
    const changed = alerts.find((a) => a.kind === "SOURCE_CHANGED");
    expect(changed).toBeDefined();
    expect(changed!.severity).toBe("INFO");
    expect(changed!.key).toBe("SOURCE_CHANGED:s1:2026-09-13");
  });
});
