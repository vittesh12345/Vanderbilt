# College OS — System Architecture

College OS is a personal command center for a Vanderbilt undergraduate: academics,
extracurriculars, career, research, and startup life in one system that
continuously answers *"what do I need to know, do, study, prepare, apply for, or
follow up on next — and when?"*

The design principle throughout: **DISCOVER → EXTRACT → ORGANIZE → PRIORITIZE →
SCHEDULE → REMIND → ADAPT**, with the student confirming decisions rather than
maintaining data.

## Layers

```
┌────────────────────────────────────────────────────────────────────┐
│  SURFACES      Today · Week · Upcoming · Long-Term · Calendar ·    │
│                Courses · Assignments · Exams · Planner · Syllabus ·│
│                Chat  (+ Clubs/Career/Research/Startup, Phases 2–5) │
├────────────────────────────────────────────────────────────────────┤
│  INTELLIGENCE  priority · studyplan · workload · scheduler ·       │
│  (pure TS,     alerts · estimate · classprep   (src/lib/engine)    │
│   unit-tested) syllabus parser (src/lib/parsers) · conflicts       │
├────────────────────────────────────────────────────────────────────┤
│  AI LAYER      Claude (claude-opus-5) — syllabus refinement, chat  │
│                over live data, plan narratives. Optional: every    │
│                feature degrades to the heuristic engines.          │
├────────────────────────────────────────────────────────────────────┤
│  DATA          Prisma + SQLite (portable to Postgres).             │
│                Single source of truth; derived views (alerts,      │
│                calendar merge, rankings) are computed, not stored. │
├────────────────────────────────────────────────────────────────────┤
│  INGESTION     Syllabus intake (live) · source adapters (design    │
│                below) · web monitoring (design below)              │
└────────────────────────────────────────────────────────────────────┘
```

Three architectural rules keep the system maintainable as integrations grow:

1. **Engines are pure.** Everything "smart" (ranking, planning, forecasting,
   alerting) is a pure function over plain data in `src/lib/engine/` — no DB, no
   IO. `src/lib/data/queries.ts` assembles inputs; pages render outputs. New
   data sources feed the same engines with zero engine changes.
2. **Derived data is never stored.** Alerts, calendar merges, rankings, class
   prep, workload — recomputed per read so they can't go stale. Only *user
   state* persists (dismissals, completions, resolutions).
3. **Conflicts are surfaced, never auto-resolved.** Any two sources that
   disagree produce a `Conflict` row that the alert engine keeps in front of
   the user until resolved. No source silently wins.

## Data model

See `prisma/schema.prisma` (commented) and `docs/CONTRACTS.md`. Highlights:

- **Academic core**: `Semester → Course → {CourseMeeting, Assignment, Exam,
  Topic, SyllabusUpload}`, `WorkSession` (planned blocks for assignment work /
  exam study / prep / review), `CalendarEvent` (only non-derived events),
  `Conflict`, `DismissedAlert`, `Task`, `Goal`, `TimeEstimateRecord`
  (estimate-vs-actual history → calibration).
- **Phases 2–5 tables already exist** (`Club`, `ClubApplication`,
  `MonitoredSource`, `CareerItem`, `Skill`, `ResearchLab`, `ResearchOutreach`,
  `StartupItem`) so those phases are additive: new adapters + new pages, no
  migration rewrites.
- Provenance on every externally-sourced row: `source`, `sourceUrl`,
  `lastVerifiedAt`, `confidence` — the UI's `SourceTag` renders these so the
  student always knows where a claim came from and how fresh it is.

## Ingestion pipeline

Every source—present and future—goes through the same five stages:

```
DISCOVER → EXTRACT → NORMALIZE → RECONCILE → COMMIT
```

- **Discover**: enumerate items the source exposes (a syllabus's dated lines, a
  Brightspace calendar's entries, links inside course pages).
- **Extract**: pull structured fields with per-item **confidence** and the
  source line/URL for verification.
- **Normalize**: map to canonical shapes (`SyllabusExtraction`, assignment/exam
  candidates) with ISO dates and canonical kinds.
- **Reconcile**: `detectConflicts` against existing rows. Disagreement ⇒
  `Conflict` row + alert. Identical items dedupe (normalized title + same day).
- **Commit**: create rows tagged with `source`, behind an explicit user review
  step (the syllabus review screen is the template for all future adapters).

### Implemented adapter: syllabus intake

Paste syllabus text → heuristic parser (`src/lib/parsers/syllabus.ts`: dates,
grade weights, office hours, materials, policies, objectives, warnings, all
with confidence + source lines) → optional Claude refinement
(`refineSyllabusWithAI`, merged so heuristic finds never silently vanish) →
review UI (include/exclude/edit each item; conflicts previewed) → commit
(assignments/exams created with auto-estimates; course profile updated;
`Conflict` rows written).

### Designed adapter: Brightspace / VSTAR Learn

Brightspace is authenticated; College OS **never** scrapes credentials or
bypasses auth (see Privacy). Legitimate ingestion paths, in order of value:

1. **iCal feeds** — Brightspace exposes per-user calendar subscription URLs.
   The adapter treats the feed as a `MonitoredSource`, normalizes VEVENTs into
   assignment/exam candidates, and reconciles like any other source.
2. **User-exported content** — paste of a course's Content/Assignments page or
   downloaded files; the extractor handles it like a syllabus.
3. **Institution-granted API tokens** — if/when available, a
   `BrightspaceAdapter` implements the same five stages against the REST API.

**External-link resolution** (the "Complete Assignment → [external link]"
problem): links found in ingested content are classified (assignment platform /
Google Doc / GitHub / course site / other), stored on the course's `linksJson`
with `authRequired`, and public pages may be fetched (respecting robots.txt and
rate limits) to extract deadlines. Anything behind a login is surfaced as
**"Authentication required — connect this resource"** rather than crawled.

## Web-monitoring architecture (Phase 2, schema in place)

`MonitoredSource` rows describe pages worth watching (club pages, AnchorLink
listings, the Wond'ry programs page, department research pages, VU calendars).

Checker loop (a cron-invoked route/script per `checkEveryHours`):

```
fetch (conditional GET, per-host rate limit, robots.txt respected)
  → extract main content → normalize (strip nav/timestamps) → hash
  → unchanged? update lastCheckedAt only. changed? diff old/new text
  → summarize the change (Claude; heuristic diff fallback)
  → meaningful? write lastChangeSummary + surface an alert. trivial? stay silent.
```

Notification policy is deliberately conservative — the alert engine only
surfaces *meaningful* changes (new application window, changed meeting time,
new deadline), because a noisy monitor gets ignored. Every monitored fact keeps
`source`, `lastVerifiedAt`, and `confidence`; conflicting observations produce
`Conflict` rows ("club site says Tue 7pm; Instagram says Wed") rather than a
silent overwrite.

## Intelligence engines

| Engine | Answers | Key ideas |
|---|---|---|
| `priority` | "What should I do *now*?" | Not a due-date sort: urgency + required daily pace (big-later can outrank small-tomorrow) + grade weight + importance + difficulty + personal tier alignment; every score carries a human-readable reason |
| `studyplan` | "How much and *what* to study?" | Total minutes from exam kind × weight × course difficulty × weak topics; sessions ramp up toward the exam; topics split across early sessions, practice mid, full review late, short recall day-of; rationale explains WHY |
| `workload` | "How heavy is next week?" | Per-day load level (LIGHT→EXTREME) from classes, due work, exams, planned sessions; sliding-window heavy-week detection with start-early recommendations |
| `scheduler` | "When do I work on it?" | Backfills 30–90-min blocks onto the least-loaded days before the deadline; final block reserved for polish/submission |
| `alerts` | "What am I at risk of forgetting?" | Derived, tiered (7d/3d/1d/today/overdue), plus unplanned exams, heavy weeks, conflicts, review debt, overcommitment; dismissals persist by stable key |
| `estimate` | "How long will it take?" | Kind × difficulty baseline, range output, calibrated by the student's own median actual/estimated ratio per course |
| `classprep` | "What do I do before class?" | Readings/assignments due by next meeting + weak-topic refreshers + a generated 5-minute pre-class brief |

## AI layer

- Model: `claude-opus-5` via the official TypeScript SDK; server-side only.
- Used for: syllabus refinement, the chat interface (answers **only** from a
  compact JSON snapshot of the student's real data — courses, deadlines,
  plans, alerts, goals), and plan narratives.
- **Optional by construction**: `aiAvailable()` gates every call; without
  `ANTHROPIC_API_KEY` the heuristic parser and the pattern-matched chat
  fallback (`src/lib/ai/fallback.ts`) keep every feature working.

## Dashboard structure

- **Today** (`/`): top-5 ranked actions with reasons · urgent alerts · planned
  sessions (checkable) · due today · classes today with before-class prep and
  the 5-minute brief · upcoming tests · today's events · 7-day load strip.
- **This Week** (`/week`): every deadline, exam, reading, class, session, and
  event, day by day, with per-day load levels.
- **Upcoming** (`/upcoming`): 2–6 week radar — major deadlines, exam clusters,
  heavy-week warnings with recommendations, 28-day heat strip.
- **Long-Term** (`/long-term`): semester progress, tiered goals with
  milestones, non-course tasks.
- **Calendar** (`/calendar`): unified month view merging class meetings
  (expanded from weekly patterns), exams, due dates, work sessions, and events
  across all categories.
- Section pages: Courses (full profiles), Assignments (intelligence table),
  Exams (study plans), Planner (forecast + sessions), Syllabus (intake +
  conflicts), Chat, Settings (profile, tiers, integrations status).

## Privacy & authentication principles

- Legitimate authentication only; the system never asks for, stores, or replays
  university credentials, and never bypasses auth or scrapes private systems.
- Anything auth-gated becomes an explicit "connect this resource" ask.
- Public-page monitoring respects robots.txt, rate limits, and site terms.
- The only secret is `ANTHROPIC_API_KEY`, read from the environment.
- All data lives in a local SQLite file owned by the student.
