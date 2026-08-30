# Build phases & roadmap

Phased exactly as specified: each phase ships complete before the next begins,
and the schema for every phase exists from day one so later phases are
additive, never rewrites.

## Phase 1 — Academic OS ✅ (this release)

- [x] Database schema for all six phases (`prisma/schema.prisma`)
- [x] Course profiles: professor, meetings, location, credits, grade weighting,
      materials, links (with auth-required flags), office hours, notes
- [x] Assignment intelligence: kind, source, status lifecycle
      (NOT_STARTED → … → COMPLETED/OVERDUE), difficulty, importance, grade
      weight, estimate ranges, dependencies, recommended start, actual-time
      recording → calibration
- [x] Exams & quizzes with topics, weights, locations
- [x] Automatic study planning: total-minutes recommendation with WHY,
      ramped day-by-day sessions with concrete focus per session
- [x] Work-session scheduler for assignments (least-loaded-day backfill)
- [x] Workload forecast (14/28-day heat strip) + heavy-week detection with
      start-early recommendations
- [x] Before-class prep + 5-minute pre-class brief; post-class capture via
      topics ("what I didn't understand") feeding future sessions
- [x] Lightweight knowledge retention (topic mastery: INTRODUCED → … →
      NEEDS_REVIEW) wired into study plans and alerts
- [x] Syllabus intelligence: paste → heuristic + optional Claude extraction →
      review with confidences & source lines → commit; conflicts FLAGGED,
      never silently resolved
- [x] Unified calendar (classes, exams, due dates, sessions, events across
      categories)
- [x] Derived alert engine (7d/3d/1d/today/overdue tiers, unplanned exams,
      heavy weeks, conflicts, review debt, overcommitment) with persistent
      dismissals
- [x] "What should I do?" engine (top-5 with reasons; not a due-date sort)
- [x] Today / This Week / Upcoming / Long-Term dashboards
- [x] AI chat over live data with full heuristic fallback
- [x] Personal priority tiers + weekly-hours budget (overcommitment guard)
- [x] Engine unit-test suite (vitest)

## Phase 2 — Vanderbilt Intelligence ✅

- [x] Club database seeded with 28 real Vanderbilt organizations researched
      from official sources (AnchorLink, club sites), every record carrying
      source URL, confidence (VERIFIED/LIKELY/UNVERIFIED), and last-verified
      date — plus 8 Wond'ry/startup programs pre-loaded into the Phase 5 table
- [x] Recommendation engine: HIGH/MEDIUM/LOW ranked against interests,
      priority tiers, and active goals — always with the WHY
- [x] Application tracker (NOT_OPEN → … → ACCEPTED/REJECTED) wired into the
      alert engine ("opens in 5 days", deadline tiers, interview prep), the
      workload forecast, and the Top-5 action ranking
- [x] Web monitoring loop: MonitoredSource rows (18 seeded recruitment/program
      pages), hash-diff checker with meaningful-change summaries, runnable via
      `npm run monitor` (cron) or the Settings panel; changes surface as alerts
- [x] Brightspace iCal feed adapter: paste the personal calendar-feed URL or
      .ics contents → classified candidates matched to courses → review →
      commit (the first automated academic source)
- [ ] Meeting-time cross-source verification (conflict rows exist; automated
      social-page comparison lands with richer monitoring)

## Phase 3 — Career OS ✅

- [x] Application/interview/networking tracker with finance/consulting/tech
      tracks and first-year recruiting-timeline guidance
- [x] Skill matrix (current → target with inline level editing, next action,
      resource, time, deadline; 13 starter skills seeded from the spec)
- [x] Career deadlines flow into alerts, the workload forecast, and the Top-5

## Phase 4 — Research OS ✅

- [x] Lab database seeded with 20 real Vanderbilt labs/groups researched from
      official sources — prioritized by REALISTIC undergraduate access
      (DSI-SRP funding, SoE paid summer research, documented undergrad
      members), each with provenance + confidence + last-verified date
- [x] Full fit analysis per lab: why this lab / why I'm a fit / what to learn
      first / what I could offer / how to approach / next action
- [x] Outreach log with follow-up nudges through the alert engine; status
      pipeline RESEARCHING → … → ACCEPTED

## Phase 5 — Startup OS ✅

- [x] Startup dashboard: milestones & tasks, mentors & investor/customer
      outreach, startup goals with milestone progress
- [x] Wond'ry resource tracker: 8 researched programs (IMPACT, Sullivan
      Family Ideator, Builder, Founder, Mentors-in-Residence, makerspaces,
      Sohr Grants, SEC Pitch) with provenance and the researched Sept 1, 2026
      IMPACT deadline live in the calendar/alerts — flagged for verification
      against the official source, per the source-verification policy

## Phase 6 — AI Command Center ✅ (core)

- [x] One cross-system pipeline: club applications, career deadlines, startup
      due-items, and research follow-ups all flow through the SAME alert
      tiers, Top-5 ranking, and workload forecast as academics
- [x] The chat context pack carries every system (courses, plans, clubs,
      applications, career items, skills, labs, startup resources); Claude and
      the heuristic router both answer cross-system questions from live data
- [ ] Proactive scheduled daily briefs (the Today page serves this on open;
      push-style delivery is deployment-specific)
