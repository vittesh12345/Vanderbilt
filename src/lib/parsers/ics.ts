// Minimal iCalendar (.ics) parser + academic classifier.
//
// The first automated Brightspace adapter: Brightspace exposes per-user
// calendar subscription URLs, and this module turns a feed's VEVENTs into
// assignment/exam/event candidates for the same review-then-commit flow the
// syllabus intake uses. Pure and dependency-free so it's unit-testable.

export interface IcsEvent {
  uid?: string;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  categories?: string[];
  start: Date;
  end?: Date;
  /** True when DTSTART was a date-only value (all-day / deadline-style). */
  allDay: boolean;
}

/** Unfold RFC 5545 folded lines (CRLF followed by space/tab continues a line). */
function unfold(text: string): string[] {
  const raw = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines.filter((l) => l.trim().length > 0);
}

/** Undo RFC 5545 text escaping. */
function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseProp(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

/**
 * Parse an iCal date-time. Handles: 20261014T140000Z (UTC), 20261014T140000
 * (floating — treated as local), 20261014 (date-only). TZID values are
 * treated as local time (good enough for a single-timezone campus feed; the
 * review step shows the resolved time for the user to confirm).
 */
export function parseIcsDate(
  value: string,
  params: Record<string, string> = {},
): { date: Date; allDay: boolean } | null {
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly || params.VALUE === "DATE") {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(value);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59);
    return isNaN(d.getTime()) ? null : { date: d, allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
  if (!m) return null;
  const [, y, mo, da, h, mi, s, z] = m;
  const d = z
    ? new Date(
        Date.UTC(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(s ?? 0)),
      )
    : new Date(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(s ?? 0));
  return isNaN(d.getTime()) ? null : { date: d, allDay: false };
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = unfold(text);
  const events: IcsEvent[] = [];
  let current: Partial<IcsEvent> | null = null;

  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line.trim())) {
      current = {};
      continue;
    }
    if (/^END:VEVENT$/i.test(line.trim())) {
      if (current && current.summary && current.start) {
        events.push({
          summary: current.summary,
          uid: current.uid,
          description: current.description,
          location: current.location,
          url: current.url,
          categories: current.categories,
          start: current.start,
          end: current.end,
          allDay: current.allDay ?? false,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const prop = parseProp(line);
    if (!prop) continue;
    switch (prop.name) {
      case "UID":
        current.uid = prop.value.trim();
        break;
      case "SUMMARY":
        current.summary = unescapeText(prop.value).trim();
        break;
      case "DESCRIPTION":
        current.description = unescapeText(prop.value).trim();
        break;
      case "LOCATION":
        current.location = unescapeText(prop.value).trim();
        break;
      case "URL":
        current.url = prop.value.trim();
        break;
      case "CATEGORIES":
        current.categories = prop.value.split(",").map((c) => unescapeText(c).trim());
        break;
      case "DTSTART": {
        const parsed = parseIcsDate(prop.value.trim(), prop.params);
        if (parsed) {
          current.start = parsed.date;
          current.allDay = parsed.allDay;
        }
        break;
      }
      case "DTEND": {
        const parsed = parseIcsDate(prop.value.trim(), prop.params);
        if (parsed) current.end = parsed.date;
        break;
      }
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Academic classification of feed events
// ---------------------------------------------------------------------------

export interface IcsCandidate {
  uid?: string;
  title: string;
  kind: "ASSIGNMENT" | "EXAM" | "QUIZ" | "EVENT";
  at: Date;
  endAt?: Date;
  location?: string;
  url?: string;
  /** Course code detected in the summary/categories (e.g. "CS 1101"), if any. */
  courseCode?: string;
  sourceLine: string;
}

const COURSE_CODE_RE = /\b([A-Z]{2,4})\s?-?\s?(\d{3,4}[A-Za-z]?)\b/;

export function classifyIcsEvents(events: IcsEvent[]): IcsCandidate[] {
  return events.map((e) => {
    const text = `${e.summary} ${e.categories?.join(" ") ?? ""}`;
    const l = text.toLowerCase();
    let kind: IcsCandidate["kind"] = "EVENT";
    if (/\bquiz(?:zes)?\b/.test(l)) kind = "QUIZ";
    else if (/\b(midterm|final|exam|test)\b/.test(l)) kind = "EXAM";
    else if (
      /\b(due|assignment|homework|hw|problem\s*set|p-?set|submit|dropbox|essay|paper|project|lab|discussion)\b/.test(l) ||
      e.allDay // Brightspace deadline entries are typically date-only
    )
      kind = "ASSIGNMENT";

    const codeMatch =
      COURSE_CODE_RE.exec(e.summary) ??
      (e.categories ? COURSE_CODE_RE.exec(e.categories.join(" ")) : null);

    // Strip a leading course-code prefix and due-noise from the title.
    let title = e.summary
      .replace(/^[A-Z]{2,4}\s?-?\s?\d{3,4}[A-Za-z]?\s*[-–—:]\s*/, "")
      .replace(/\s*-\s*(due|available)\s*$/i, "")
      .trim();
    if (!title) title = e.summary.trim();

    return {
      uid: e.uid,
      title,
      kind,
      at: e.start,
      endAt: e.end,
      location: e.location,
      url: e.url,
      courseCode: codeMatch ? `${codeMatch[1]} ${codeMatch[2]}` : undefined,
      sourceLine: e.summary,
    };
  });
}
