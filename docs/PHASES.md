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

## Phase 2 — Vanderbilt Intelligence (schema ready)

Tables in place: `Club`, `ClubApplication`, `MonitoredSource`.
- [ ] Club database + recommendation engine ranked against profile goals
      (HIGH/MEDIUM/LOW with WHY)
- [ ] Application tracker (NOT_OPEN → … → ACCEPTED/REJECTED) with open/deadline
      reminders through the existing alert engine
- [ ] Web monitoring loop (docs/ARCHITECTURE.md § Web monitoring): AnchorLink,
      club sites/socials, VU calendars; meaningful-change notifications only
- [ ] Meeting-time verification with conflict flagging ("site says Tue,
      Instagram says Wed")
- [ ] Brightspace iCal feed adapter (first automated academic source)

## Phase 3 — Career OS (schema ready)

Tables in place: `CareerItem`, `Skill`.
- [ ] Finance / consulting / tech tracks; recruiting timeline awareness
- [ ] Skill matrix (current → target, next action, resource, time, deadline)
- [ ] Career events + applications in the unified calendar & alerts

## Phase 4 — Research OS (schema ready)

Tables in place: `ResearchLab`, `ResearchOutreach`.
- [ ] Lab database with fit analysis (why this lab / why I'm a fit / learn
      first / could offer / how to approach)
- [ ] Outreach tracker (RESEARCHING → … → ACCEPTED) with follow-up nudges

## Phase 5 — Startup OS (schema ready)

Tables in place: `StartupItem`.
- [ ] Startup dashboard: milestones, funding, competitions, programs, mentors,
      investor/customer outreach
- [ ] Wond'ry resource tracker (IMPACT, Ideator, mentorship, makerspace) with
      deadline verification against current official sources

## Phase 6 — AI Command Center

- [ ] Cross-system reasoning in chat ("bio exam Friday + consulting app
      Wednesday + Wond'ry deadline Monday — here's your next 8 hours")
      — the context pack already aggregates all systems; this phase widens it
      to Phases 2–5 data and adds proactive daily briefs.
