# College OS

A personal, AI-powered command center for Vanderbilt undergraduate life —
academics, clubs, career, research, and startup work in one system that
continuously answers:

> *"What do I need to know, do, study, prepare, apply for, or follow up on
> next — and when should I do it?"*

Not another calendar or task manager: College OS **discovers → extracts →
organizes → prioritizes → schedules → reminds → adapts**, so your job is to
confirm things, complete things, and make decisions.

## What Phase 1 (Academic OS) does

- **Today / This Week / Upcoming / Long-Term** dashboards
- **Top-5 actions every day** — ranked by urgency, required daily pace, grade
  impact, difficulty, and your personal priority tiers (never just a due-date
  sort), each with the reason it ranks where it does
- **Syllabus intelligence** — paste a syllabus; heuristic + optional Claude
  extraction pulls every date, grade weight, office hour, material, and
  policy, with confidence tags and source lines; you review, then commit.
  Disagreements with existing records are **flagged as conflicts, never
  silently resolved**
- **Automatic study planning** — how much to study (with the WHY) and exactly
  what each session covers, ramping toward the exam with a day-of recall pass
- **Work-session scheduling** — big assignments get 30–90-minute blocks
  backfilled onto your lightest days before the deadline
- **Workload forecast** — 14/28-day heat strip, heavy-week detection, and
  start-early recommendations
- **Before-class prep** — readings/problems due, weak-topic refreshers, and a
  generated 5-minute pre-class brief; after class, capture "what I didn't
  understand" and it feeds future study sessions
- **Proactive alerts** — 7d/3d/1d/today/overdue tiers, unplanned exams, heavy
  weeks, source conflicts, review debt, overcommitment risk
- **Unified calendar** — classes, exams, due dates, study sessions, and
  club/career/research/startup events in one place
- **Ask College OS** — a chat that answers from *your actual data* ("What
  should I do if I only have 2 hours tonight?"), with a full heuristic
  fallback when no API key is configured
- **Getting your real schedule in** — paste your YES class schedule on
  **Syllabus Intelligence** and it becomes courses, meeting days, times, rooms,
  instructors, and credit hours in one step, with every row reviewable first.
  College OS never logs into YES: you sign in, you copy, you paste.

**Phase 2 (Vanderbilt Intelligence) is also live**: a club database seeded
with 28 real Vanderbilt organizations (researched from official sources, each
with provenance + confidence + last-verified date), a recommendation engine
that ranks them against YOUR interests/tiers/goals with reasons, an
application tracker wired into alerts and the daily Top-5, a web-monitoring
loop (18 watched recruitment/program pages, `npm run monitor` for cron), and a
Brightspace iCal-feed adapter. Run `npm run seed:clubs` to load the researched set.

**Phases 3–6 are live too**: Career OS (application/interview tracker + skill
matrix), Research OS (20 real researched Vanderbilt labs with per-lab fit
analysis and follow-up nudges — `npm run seed:labs`), Startup OS (Wond'ry
programs with real deadlines, milestones, mentors), and the cross-system
command core: every life system feeds ONE alert/priority/workload pipeline
and the AI chat reasons across all of it. See `docs/PHASES.md`.

## Quickstart

```bash
npm install
cp .env.example .env          # SQLite by default; add ANTHROPIC_API_KEY for AI
npm run setup                 # prisma db push + demo seed (relative dates)
npm run dev                   # http://localhost:3000
```

The seed creates a realistic Vanderbilt semester relative to *today* — a
biology midterm next week with a generated study plan, work due tomorrow, a
big essay worth starting early, club/career/startup events, goals, and one
source conflict — so every dashboard is alive immediately. Re-run `npm run
seed` anytime to reset.

```bash
npm test                      # engine unit tests (vitest)
npm run build                 # production build
```

### AI features

Set `ANTHROPIC_API_KEY` in `.env` to enable Claude-powered syllabus
refinement and chat (`claude-opus-5`). Without it, everything still works via
the built-in heuristic engines — AI enhances, it is never required.

## Architecture

See `docs/ARCHITECTURE.md` (layers, ingestion pipeline, web-monitoring design,
engine catalog, privacy principles), `docs/CONTRACTS.md` (module conventions),
and `prisma/schema.prisma` (commented data model for all six phases).

**Privacy stance:** legitimate authentication only — no credential storage, no
scraping of authenticated systems, no bypassing access controls. Anything
behind a login becomes an explicit "connect this resource" ask.
