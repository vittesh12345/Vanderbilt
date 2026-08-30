# Module-builder contracts

Conventions every College OS module follows. The exemplar implementation is the
Today page (`src/app/page.tsx`) + its micro-components — copy its patterns.

## Stack

- Next.js 15 App Router, React 19, TypeScript strict, Tailwind 3.4.
- Prisma 6 + SQLite. Schema: `prisma/schema.prisma`. "Enums" are strings —
  canonical value sets in `src/lib/types.ts`. `*_Json` columns hold serialized
  JSON — always read via `parseJson` from `src/lib/json.ts`, write via `toJson`.
- Path alias `@/*` → `src/*`.

## Server pages

- Data pages are **server components** with `export const dynamic = "force-dynamic";`
- Fetch through `src/lib/data/queries.ts` where a fetcher exists. If you need a
  new query, write it INSIDE your own page/module file using `db` from
  `@/lib/db` — do NOT edit `queries.ts` (other agents build in parallel).
- Engines are pure functions in `src/lib/engine/*` — call them with plain data.
- Dates: helpers in `src/lib/dates.ts` (`fmtTime`, `fmtDay`, `fmtMinutes`,
  `fmtMinutesRange`, `daysUntil`, `dueLabel`, `weekBounds`, `parseHM`).

## Client components

- Small, focused, `"use client"` at top. Mutations `fetch()` an API route, then
  `router.refresh()`. See `src/components/SessionCheck.tsx`.
- Forms: controlled inputs, POST/PATCH JSON, minimal styling with the tokens
  below. Keep forms in `src/components/` (e.g. `CourseForm.tsx`).

## API routes (`src/app/api/...`)

- Next 15 signature: `export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> })` —
  `params` is a **Promise**; `await` it. See `src/app/api/sessions/[id]/route.ts`.
- Validate inputs defensively; return `NextResponse.json({ error }, { status })`
  on bad input; 404 via try/catch around Prisma update/delete.
- Dates arrive as ISO strings — `new Date(value)` and check `isNaN(d.getTime())`.

## UI kit (`src/components/ui.tsx`) — use these, don't reinvent

`PageHeader`, `Card`, `CourseDot`, `StatusPill`, `PriorityTag`, `AlertRow`,
`LoadChip`, `Stat`, `ProgressBar`, `EmptyState`, `SourceTag`.

Design tokens (CSS vars in `globals.css`): surfaces `--surface-0/1`, `--border`,
ink `--text-primary/secondary/muted`, accents `--gold`, `--gold-deep`,
`--black`, status `--status-good/warning/serious/critical`. Course identity =
the stored `course.color` (assigned via `nextCourseColor` in `src/lib/palette.ts`
at creation — never recompute for existing courses). Text always wears text
tokens; color rides on dots/borders/chips only. Workload levels render with
`LoadChip` (color + text label, never color alone).

## Semantics

- "Open" assignment/task statuses: `NOT_STARTED | IN_PROGRESS | BLOCKED`.
- Completing an assignment: set `status`, `completedAt`, optionally
  `actualMinutes`; when `actualMinutes` and `estMinutes` both exist, insert a
  `TimeEstimateRecord` (entityType `ASSIGNMENT`, courseId, kind) for calibration.
- Deleting/updating derived data: WorkSessions cascade with their parents.
- Alerts are derived — never insert alert rows; dismissals go through
  `POST /api/alerts/dismiss` with the alert `key`.
- Conflicts: on syllabus commit, `detectConflicts` (src/lib/conflicts.ts)
  results become `Conflict` rows; surfaced by the alert engine automatically.

## Verification

Run `npx tsc --noEmit` and fix errors **in your files only** — errors in files
you don't own are other in-flight modules; ignore them. Keep imports limited to
what exists (check before importing). Match the visual style of the exemplar:
compact, light, generous whitespace, 13–14px body text.
