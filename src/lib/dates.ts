import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
  endOfWeek,
  endOfDay,
} from "date-fns";

export { addDays, differenceInCalendarDays, isSameDay, startOfDay, endOfDay };

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Days from `from` (default now) until `to`, in calendar days. Negative = past. */
export function daysUntil(to: Date, from: Date = new Date()): number {
  return differenceInCalendarDays(to, from);
}

/** Monday-based week bounds around a date. */
export function weekBounds(d: Date = new Date()): { start: Date; end: Date } {
  return {
    start: startOfWeek(d, { weekStartsOn: 1 }),
    end: endOfWeek(d, { weekStartsOn: 1 }),
  };
}

export function fmtDay(d: Date): string {
  return format(d, "EEE MMM d");
}

export function fmtDayFull(d: Date): string {
  return format(d, "EEEE, MMMM d");
}

export function fmtTime(d: Date): string {
  return format(d, "h:mm a");
}

export function fmtDateTime(d: Date): string {
  return format(d, "EEE MMM d, h:mm a");
}

/** "14:05" → minutes since midnight. Returns null on malformed input. */
export function parseHM(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** minutes since midnight → "2:05 PM". */
export function fmtHM(hm: string): string {
  const mins = parseHM(hm);
  if (mins == null) return hm;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/** "75" → "1 hr 15 min"; "45" → "45 min". */
export function fmtMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Range formatting for uncertain estimates: fmtMinutesRange(60, 90) → "60–90 min". */
export function fmtMinutesRange(min: number, max?: number | null): string {
  if (!max || max <= min) return fmtMinutes(min);
  if (min < 60 && max < 60) return `${min}–${max} min`;
  return `${fmtMinutes(min)} – ${fmtMinutes(max)}`;
}

/** Human phrasing for a deadline distance. */
export function dueLabel(dueAt: Date, now: Date = new Date()): string {
  const days = daysUntil(dueAt, now);
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days <= 7) return `due ${format(dueAt, "EEEE")}`;
  return `due ${format(dueAt, "MMM d")}`;
}
