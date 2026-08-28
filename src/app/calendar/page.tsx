// UNIFIED CALENDAR — one month grid merging classes, exams, due dates,
// planned work sessions, and standalone events (clubs, career, research,
// startup, personal). Derived entries come from getUnifiedCalendar at query
// time — the CalendarEvent table only holds genuine standalone events.

import Link from "next/link";
import {
  addDays,
  addMonths,
  endOfDay,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { db } from "@/lib/db";
import { getUnifiedCalendar, type UnifiedEvent } from "@/lib/data/queries";
import { fmtMinutes, fmtTime } from "@/lib/dates";
import { Card, CourseDot, EmptyState, PageHeader } from "@/components/ui";
import { AddEventButton } from "@/components/EventForm";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Small letter badge per standalone-event category (legend below the grid).
const CATEGORY_LETTERS: Record<string, string> = {
  ACADEMIC: "A",
  CLUB: "K",
  CAREER: "C",
  RESEARCH: "R",
  STARTUP: "S",
  PERSONAL: "P",
};

const FALLBACK_COLOR = "var(--gold-deep)";

/** Compact chip time: "9:05a". */
function chipTime(d: Date): string {
  return format(d, "h:mmaaaaa");
}

function dayKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Planned-session details (minutes, optional start time) keyed by session id —
 *  getUnifiedCalendar doesn't carry these, so the page pulls them itself. */
async function getSessionDetails(start: Date, end: Date) {
  const rows = await db.workSession.findMany({
    where: { date: { gte: startOfDay(start), lte: end } },
    select: { id: true, minutes: true, startTime: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-neutral-200 text-[9px] font-bold text-neutral-600"
      title={category.toLowerCase()}
    >
      {CATEGORY_LETTERS[category] ?? "?"}
    </span>
  );
}

/** One compact chip inside a day cell; rendering varies by entry kind. */
function EntryChip({
  ev,
  minutes,
}: {
  ev: UnifiedEvent;
  minutes?: number;
}) {
  let inner: React.ReactNode;
  if (ev.kind === "CLASS") {
    inner = (
      <div
        className="truncate rounded-sm border-l-2 pl-1 text-[11px] leading-4"
        style={{ borderLeftColor: ev.color ?? FALLBACK_COLOR }}
      >
        <span className="font-semibold">{ev.courseCode}</span>{" "}
        <span className="text-[var(--text-muted)]">{chipTime(ev.startAt)}</span>
      </div>
    );
  } else if (ev.kind === "EXAM") {
    inner = (
      <div className="flex items-center gap-1 text-[11px] leading-4">
        <CourseDot color={ev.color ?? FALLBACK_COLOR} />
        <span className="truncate font-bold">{ev.title}</span>
      </div>
    );
  } else if (ev.kind === "DUE") {
    inner = (
      <div className="flex items-center gap-1 text-[11px] leading-4">
        <CourseDot color={ev.color ?? FALLBACK_COLOR} />
        <span className="truncate">• {ev.title}</span>
      </div>
    );
  } else if (ev.kind === "SESSION") {
    inner = (
      <div className="truncate text-[11px] leading-4 text-[var(--text-muted)]">
        {ev.title}
        {minutes ? ` · ${fmtMinutes(minutes)}` : ""}
      </div>
    );
  } else {
    // Standalone EVENT: color-neutral chip + category letter badge.
    inner = (
      <div className="flex items-center gap-1 rounded-sm bg-neutral-100 px-1 py-px text-[11px] leading-4">
        <CategoryBadge category={ev.category} />
        <span className="truncate">{ev.title}</span>
      </div>
    );
  }

  if (ev.href && ev.href !== "/calendar") {
    return (
      <Link href={ev.href} className="block hover:opacity-75" title={ev.title}>
        {inner}
      </Link>
    );
  }
  return <div title={ev.title}>{inner}</div>;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string | string[] }>;
}) {
  const now = new Date();
  const sp = await searchParams;
  const mParam = typeof sp.m === "string" ? sp.m : undefined;

  let monthStart = startOfMonth(now);
  if (mParam && /^\d{4}-\d{2}$/.test(mParam)) {
    const [y, mo] = mParam.split("-").map(Number);
    if (mo >= 1 && mo <= 12) monthStart = new Date(y, mo - 1, 1);
  }

  // 6 × 7 Monday-start grid always shows 42 days.
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfDay(addDays(gridStart, 41));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const [entries, sessionDetails] = await Promise.all([
    getUnifiedCalendar(gridStart, gridEnd),
    getSessionDetails(gridStart, gridEnd),
  ]);

  const byDay = new Map<string, UnifiedEvent[]>();
  for (const ev of entries) {
    const key = dayKey(ev.startAt);
    const list = byDay.get(key);
    if (list) list.push(ev);
    else byDay.set(key, [ev]);
  }

  const monthEntryCount = entries.filter((e) =>
    isSameMonth(e.startAt, monthStart),
  ).length;

  const prev = format(subMonths(monthStart, 1), "yyyy-MM");
  const next = format(addMonths(monthStart, 1), "yyyy-MM");

  // Agenda: remaining days of the viewed month (today onward) with entries.
  const agendaDays = days.filter(
    (d) => isSameMonth(d, monthStart) && d >= startOfDay(now),
  );
  const agendaWithEntries = agendaDays
    .map((d) => ({ day: d, list: byDay.get(dayKey(d)) ?? [] }))
    .filter((g) => g.list.length > 0);

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={`${format(monthStart, "MMMM yyyy")} · ${monthEntryCount} entr${monthEntryCount === 1 ? "y" : "ies"} — classes, exams, due dates, sessions & events in one place`}
        action={<AddEventButton />}
      />

      {/* Month navigation */}
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={`/calendar?m=${prev}`}
          className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-sm font-medium hover:border-[var(--gold-deep)]"
        >
          ← {format(subMonths(monthStart, 1), "MMM")}
        </Link>
        <h2 className="min-w-40 text-center text-lg font-bold tracking-tight">
          {format(monthStart, "MMMM yyyy")}
        </h2>
        <Link
          href={`/calendar?m=${next}`}
          className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-sm font-medium hover:border-[var(--gold-deep)]"
        >
          {format(addMonths(monthStart, 1), "MMM")} →
        </Link>
        <Link
          href="/calendar"
          className="ml-2 text-sm font-medium text-[var(--gold-deep)] hover:underline"
        >
          Today
        </Link>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-px px-px">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
          >
            {d}
          </div>
        ))}
      </div>

      {/* 6 × 7 month grid */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] shadow-sm">
        {days.map((day) => {
          const inMonth = isSameMonth(day, monthStart);
          const today = isSameDay(day, now);
          const list = byDay.get(dayKey(day)) ?? [];
          const shown = list.slice(0, 4);
          const extra = list.length - shown.length;
          return (
            <div
              key={day.toISOString()}
              className={
                inMonth
                  ? "min-h-[104px] bg-[var(--surface-1)] p-1.5"
                  : "min-h-[104px] bg-[var(--surface-0)] p-1.5 opacity-60"
              }
            >
              <div className="flex justify-end">
                <span
                  className={
                    today
                      ? "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ring-2 ring-[var(--gold)]"
                      : inMonth
                        ? "flex h-6 w-6 items-center justify-center text-xs font-medium text-[var(--text-secondary)]"
                        : "flex h-6 w-6 items-center justify-center text-xs text-[var(--text-muted)]"
                  }
                >
                  {format(day, "d")}
                </span>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {shown.map((ev) => (
                  <EntryChip
                    key={`${ev.kind}:${ev.id}`}
                    ev={ev}
                    minutes={
                      ev.kind === "SESSION"
                        ? sessionDetails.get(ev.id)?.minutes
                        : undefined
                    }
                  />
                ))}
                {extra > 0 ? (
                  <div className="text-[10px] font-medium text-[var(--text-muted)]">
                    +{extra} more
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Category legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--text-secondary)]">
        <span className="font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Event categories
        </span>
        {Object.entries(CATEGORY_LETTERS).map(([category, letter]) => (
          <span key={category} className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-neutral-200 text-[9px] font-bold text-neutral-600">
              {letter}
            </span>
            {category.toLowerCase()}
          </span>
        ))}
      </div>

      {/* Agenda for the rest of the viewed month */}
      {agendaDays.length > 0 ? (
        <div className="mt-6">
          <Card title={`Agenda — rest of ${format(monthStart, "MMMM")}`}>
            {agendaWithEntries.length === 0 ? (
              <EmptyState
                title="Nothing scheduled for the rest of this month"
                hint="Add an event, or let the planner schedule some work."
              />
            ) : (
              <div className="space-y-4">
                {agendaWithEntries.map(({ day, list }) => (
                  <div key={day.toISOString()}>
                    <div className="mb-1.5 text-[13px] font-bold">
                      {format(day, "EEEE, MMM d")}
                      {isSameDay(day, now) ? (
                        <span className="ml-2 rounded-full bg-[var(--gold)] px-2 py-0.5 text-[10px] font-bold text-[var(--black)]">
                          TODAY
                        </span>
                      ) : null}
                    </div>
                    <ul className="space-y-1.5">
                      {list.map((ev) => {
                        const session =
                          ev.kind === "SESSION"
                            ? sessionDetails.get(ev.id)
                            : undefined;
                        const timeLabel =
                          ev.kind === "SESSION" && !session?.startTime
                            ? "anytime"
                            : fmtTime(ev.startAt);
                        const suffixParts = [
                          ev.kind === "CLASS" && ev.endAt
                            ? `until ${fmtTime(ev.endAt)}`
                            : null,
                          ev.kind === "EVENT"
                            ? ev.category.toLowerCase()
                            : null,
                          session ? fmtMinutes(session.minutes) : null,
                          ev.location ?? null,
                        ].filter(Boolean);
                        return (
                          <li
                            key={`${ev.kind}:${ev.id}`}
                            className="flex items-baseline gap-2.5"
                          >
                            <span className="w-[4.5rem] shrink-0 text-xs font-medium text-[var(--text-secondary)]">
                              {timeLabel}
                            </span>
                            {ev.kind === "EVENT" ? (
                              <CategoryBadge category={ev.category} />
                            ) : (
                              <CourseDot color={ev.color ?? FALLBACK_COLOR} />
                            )}
                            <span
                              className={
                                ev.kind === "EXAM"
                                  ? "min-w-0 truncate text-sm font-bold"
                                  : ev.kind === "SESSION"
                                    ? "min-w-0 truncate text-sm text-[var(--text-muted)]"
                                    : "min-w-0 truncate text-sm font-medium"
                              }
                            >
                              {ev.title}
                            </span>
                            {suffixParts.length > 0 ? (
                              <span className="shrink-0 text-xs text-[var(--text-muted)]">
                                {suffixParts.join(" · ")}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
