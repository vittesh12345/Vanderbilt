// YES / VSTAR class-schedule intake.
//
// You copy your registered schedule out of YES ("Your Enrollment Services")
// and paste it here. Nothing logs into YES and no credentials are involved —
// the text is yours, handed over deliberately.
//
// The parser is deliberately tolerant, because a copy-paste flattens the
// three shapes YES renders into three different plain-text layouts: an HTML
// table (tab- or run-of-spaces separated cells), a printable list (one
// labelled field per line), and enrollment-cart cards (code + title, then a
// meeting line). Everything it produces is a *candidate* for the review step;
// nothing reaches the database until the student confirms it.

export type MeetingKind = "LECTURE" | "LAB" | "DISCUSSION" | "SEMINAR";
export type ParseConfidence = "VERIFIED" | "LIKELY" | "UNVERIFIED";

export interface ParsedMeeting {
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  startTime: string; // "10:10", 24h local
  endTime: string; // "11:00"
  location: string | null;
  kind: MeetingKind;
  sourceLine: string;
  /** True when a meridiem had to be guessed — surfaced in the review UI. */
  inferredMeridiem: boolean;
}

export interface ParsedCourse {
  code: string; // normalized "CS 1101"
  title: string;
  section: string | null;
  credits: number | null;
  professor: string | null;
  location: string | null;
  meetings: ParsedMeeting[];
  confidence: ParseConfidence;
  warnings: string[];
  sourceLines: string[];
}

export interface ParsedSchedule {
  term: string | null;
  courses: ParsedCourse[];
  warnings: string[];
}

/* ------------------------------------------------------------------ days */

const FULL_DAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// Two-letter codes are checked before single letters so "Th" reads as
// Thursday rather than Tuesday-then-(invalid).
const TWO_LETTER_DAYS: Record<string, number> = {
  su: 0,
  mo: 1,
  tu: 2,
  we: 3,
  th: 4,
  fr: 5,
  sa: 6,
};

// Vanderbilt's compact form: R is Thursday, U is Sunday.
const SINGLE_DAYS: Record<string, number> = {
  u: 0,
  m: 1,
  t: 2,
  w: 3,
  r: 4,
  f: 5,
  s: 6,
};

/**
 * "MWF", "TR", "TuTh", "Mo We Fr", "Monday, Wednesday" -> [1,3,5] etc.
 * Returns null when the token is not a day cluster at all.
 */
export function parseDayTokens(raw: string): number[] | null {
  const lower = raw.toLowerCase();

  // 1. Full day names anywhere in the token.
  const full: number[] = [];
  for (const [name, n] of Object.entries(FULL_DAYS)) {
    if (new RegExp(`\\b${name}s?\\b`).test(lower)) full.push(n);
  }
  if (full.length) return dedupeSorted(full);

  // 2. Letters only; separators (spaces, commas, slashes) are noise.
  const letters = lower.replace(/[^a-z]/g, "");
  if (!letters) return null;

  // 3. All two-letter codes (TuTh, MoWeFr).
  if (letters.length % 2 === 0) {
    const pairs: number[] = [];
    let ok = true;
    for (let i = 0; i < letters.length; i += 2) {
      const n = TWO_LETTER_DAYS[letters.slice(i, i + 2)];
      if (n === undefined) {
        ok = false;
        break;
      }
      pairs.push(n);
    }
    if (ok && pairs.length) return dedupeSorted(pairs);
  }

  // 4. Single letters (MWF, TR, MTWRF).
  const singles: number[] = [];
  for (const ch of letters) {
    const n = SINGLE_DAYS[ch];
    if (n === undefined) return null;
    singles.push(n);
  }
  return singles.length ? dedupeSorted(singles) : null;
}

function dedupeSorted(ns: number[]): number[] {
  return [...new Set(ns)].sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ times */

interface Clock {
  hour: number; // 1..12 when meridiem is set, else 0..23
  minute: number;
  meridiem: "am" | "pm" | null;
}

const ONE_TIME = String.raw`\d{1,2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?`;
const TIME_RANGE_RE = new RegExp(
  String.raw`(?<![\d:])(${ONE_TIME})\s*(?:-|–|—|to|until)\s*(${ONE_TIME})(?![\d:])`,
  "i",
);

function parseClock(raw: string): Clock | null {
  const m = raw
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s?m?\.?)?$/i);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  // The capture is the a/p letter alone, not the whole "AM"/"PM".
  const meridiem: "am" | "pm" | null = m[3]
    ? m[3].toLowerCase() === "p"
      ? "pm"
      : "am"
    : null;
  if (minute > 59) return null;
  if (meridiem ? hour < 1 || hour > 12 : hour > 23) return null;
  return { hour, minute, meridiem };
}

function to24(c: Clock, meridiem: "am" | "pm"): number {
  const h = c.hour % 12;
  return (meridiem === "pm" ? h + 12 : h) * 60 + c.minute;
}

function fmt(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Classes run 08:00–21:00, so a bare 1–7 means afternoon and 8–12 morning. */
function guessMeridiem(hour: number): "am" | "pm" {
  return hour >= 8 && hour <= 12 ? "am" : "pm";
}

export interface TimeRange {
  startTime: string;
  endTime: string;
  inferredMeridiem: boolean;
  /** Index range of the match in the source line. */
  index: number;
  length: number;
}

/**
 * Finds a clock-time range in a line. Rejects things that merely look like
 * one ("1101-01", "2026-2027") by requiring a colon or a meridiem somewhere
 * in the pair.
 */
export function parseTimeRange(line: string): TimeRange | null {
  const m = line.match(TIME_RANGE_RE);
  if (!m || m.index === undefined) return null;
  const [whole, rawStart, rawEnd] = m;
  if (!/[:]|[ap]\.?\s?m/i.test(rawStart + rawEnd)) return null;

  const start = parseClock(rawStart);
  const end = parseClock(rawEnd);
  if (!start || !end) return null;

  let inferred = false;
  let startMer = start.meridiem;
  let endMer = end.meridiem;

  if (!endMer && startMer) {
    endMer = startMer;
    inferred = true;
  }
  if (!startMer && endMer) {
    startMer = endMer;
    inferred = true;
  }
  if (!startMer && !endMer) {
    // Only guess for 12-hour-looking values; a 24h clock needs no meridiem.
    if (start.hour > 12 || end.hour > 12) {
      const s = start.hour * 60 + start.minute;
      const e = end.hour * 60 + end.minute;
      return e > s
        ? { startTime: fmt(s), endTime: fmt(e), inferredMeridiem: false, index: m.index, length: whole.length }
        : null;
    }
    startMer = guessMeridiem(start.hour);
    endMer = guessMeridiem(end.hour);
    inferred = true;
  }

  let s = to24(start, startMer!);
  let e = to24(end, endMer!);
  // "11:00 - 1:15 pm" inherits pm onto an 11am start; flip it back.
  if (e <= s && start.meridiem === null) {
    s = to24(start, "am");
    inferred = true;
  }
  if (e <= s && end.meridiem === null) {
    e = to24(end, "pm");
    inferred = true;
  }
  if (e <= s) return null;

  return {
    startTime: fmt(s),
    endTime: fmt(e),
    inferredMeridiem: inferred,
    index: m.index,
    length: whole.length,
  };
}

/* --------------------------------------------------------------- meetings */

const DAY_WORD = String.raw`(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|su|mo|tu|we|th|fr|sa|[umtwrfs])`;
// A day cluster must start at a non-letter boundary so "Room" cannot
// contribute its trailing "m" as Monday.
const DAY_CLUSTER_BEFORE = new RegExp(
  String.raw`(?:^|[^A-Za-z])((?:${DAY_WORD}[,.&/\s-]*)+)$`,
  "i",
);
const DAY_CLUSTER_AFTER = new RegExp(
  String.raw`^[\s|]*((?:${DAY_WORD}[,.&/\s-]*)+?)(?![A-Za-z])`,
  "i",
);

function meetingKindFor(line: string, fallback: MeetingKind): MeetingKind {
  if (/\blab(?:oratory)?\b/i.test(line)) return "LAB";
  if (/\b(?:discussion|recitation|section\s+meeting)\b/i.test(line)) {
    return "DISCUSSION";
  }
  if (/\bseminar\b/i.test(line)) return "SEMINAR";
  return fallback;
}

/** Splits a table-ish remainder into cells (tabs, pipes, or 2+ spaces). */
function cells(s: string): string[] {
  return s
    .split(/\t|\s{2,}|\|/)
    .map((c) => c.replace(/^[\s,;-]+|[\s,;-]+$/g, ""))
    .filter(Boolean);
}

const NOT_A_LOCATION =
  /^(?:online|tba|tbd|no room|does not meet|arranged|arr)\.?$/i;

export interface ParsedMeetingLine {
  meetings: ParsedMeeting[];
  /**
   * Trailing cells left over after the day cluster, the time range, and the
   * location — in table layouts these carry the instructor and unit count.
   * Only trailing cells are kept: cells *before* the day cluster are the
   * course code and title, which must never be mistaken for an instructor.
   */
  leftovers: string[];
}

/**
 * Parses one line that contains a day cluster and a time range into one
 * meeting per day. Returns null when the line has no meeting in it.
 */
export function parseMeetingLine(
  line: string,
  fallbackKind: MeetingKind = "LECTURE",
): ParsedMeetingLine | null {
  const range = parseTimeRange(line);
  if (!range) return null;

  const before = line.slice(0, range.index);
  const after = line.slice(range.index + range.length);

  let days: number[] | null = null;
  const beforeTrimmed = before.replace(/[\s|,]+$/, "");
  const beforeMatch = beforeTrimmed.match(DAY_CLUSTER_BEFORE);
  if (beforeMatch) days = parseDayTokens(beforeMatch[1]);
  let afterRest = after;
  if (!days) {
    const afterMatch = after.match(DAY_CLUSTER_AFTER);
    if (afterMatch) {
      days = parseDayTokens(afterMatch[1]);
      if (days) afterRest = after.slice(afterMatch[0].length);
    }
  }
  if (!days || !days.length) return null;

  const tail = cells(afterRest);
  let location: string | null = null;
  const leftovers: string[] = [];

  for (const c of tail) {
    if (
      location === null &&
      !NOT_A_LOCATION.test(c) &&
      !/^\d+(?:\.\d+)?$/.test(c) &&
      !/^(?:instructor|professor|units?|hours?|credits?)\b/i.test(c) &&
      /[A-Za-z]/.test(c)
    ) {
      location = c.slice(0, 120);
    } else {
      leftovers.push(c);
    }
  }

  const kind = meetingKindFor(line, fallbackKind);
  return {
    meetings: days.map((dayOfWeek) => ({
      dayOfWeek,
      startTime: range.startTime,
      endTime: range.endTime,
      location,
      kind,
      sourceLine: line.trim().slice(0, 200),
      inferredMeridiem: range.inferredMeridiem,
    })),
    leftovers,
  };
}

/* ---------------------------------------------------------------- courses */

// Vanderbilt subject codes are 2–5 letters, all caps — which is what keeps
// ordinary prose out — and catalog numbers are four digits with an optional
// trailing letter: ENGL 1250W, BSCI 1510L.
const COURSE_CODE_RE = /\b([A-Z]{2,5})[ -]?(\d{4}[A-Z]?)\b/;
const COURSE_CODE_RE_G = new RegExp(COURSE_CODE_RE.source, "g");

const TERM_RE = /\b(fall|spring|summer|winter|maymester)\s+(\d{4})\b/i;

const LABEL_LINE_RE =
  /^\s*(?:class\s*nbr|class\s*number|status|grading|career|session|component|academic\s+group|units?|hours?|credits?|enrolled|waitlist|dropped|deadlines?|meeting\s+information|days?\s*(?:&|and)?\s*times?|room|instructor|start\/end\s+date)\b\s*:?/i;

function normalizeCode(subject: string, number: string): string {
  return `${subject.toUpperCase()} ${number.toUpperCase()}`;
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/^[\s\-–—:|,.]+/, "")
    .replace(/[\s\-–—:|,.]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractSection(line: string): string | null {
  const m =
    line.match(/\b(?:section|sect|sec)\s*[:.]?\s*([0-9]{1,3}[A-Z]?)\b/i) ??
    line.match(/\d{3,4}[A-Z]?\s*-\s*([0-9]{2,3}[A-Z]?)\b/);
  return m ? m[1].toUpperCase() : null;
}

function extractCredits(block: string): number | null {
  const m =
    block.match(/(?:credit\s*hours?|units?|hours?|credits?)\s*[:.]?\s*(\d(?:\.\d+)?)/i) ??
    block.match(/\b(\d(?:\.\d+)?)\s*(?:credit\s*hours?|units?|credits?)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n <= 12 ? n : null;
}

function extractProfessor(block: string): string | null {
  const m = block.match(
    /(?:instructor|professor|faculty|taught\s+by)\(?s?\)?\s*[:.]?\s*([^\n\t|]{2,60})/i,
  );
  if (!m) return null;
  const name = m[1]
    .replace(/\s{2,}.*$/, "")
    .replace(/^[\s,.:-]+|[\s,.:;-]+$/g, "")
    .trim();
  if (!name || /^(?:staff|tba|tbd)$/i.test(name)) return null;
  if (!/[A-Za-z]/.test(name)) return null;
  // YES pages put enrollment prose next to the word "instructor" —
  // "consent of instructor and DUS after first day of class, 8/26/2026".
  // A person's name has no digits, does not open with a lowercase
  // connective, and is not a sentence. Anything else is not a name.
  if (/\d/.test(name)) return null;
  if (/^(?:and|or|of|the|for|with|from|by|to|is|are|no|not|see|consent|permission)\b/i.test(name)) {
    return null;
  }
  if (name.split(/\s+/).length > 6) return null;
  return name.slice(0, 60);
}

/** A leftover cell that reads like a person's name rather than a room. */
function looksLikeName(s: string): boolean {
  return (
    /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+$/.test(s.trim()) &&
    s.trim().length <= 40 &&
    !/\b(?:hall|center|centre|building|bldg|room|library|house|lab)\b/i.test(s)
  );
}

interface Block {
  code: string;
  lines: string[];
}

/** Groups the pasted text into one block per course code. */
function splitBlocks(lines: string[]): { blocks: Block[]; preamble: string[] } {
  const blocks: Block[] = [];
  const preamble: string[] = [];
  const byCode = new Map<string, Block>();
  let current: Block | null = null;

  for (const line of lines) {
    const m = line.match(COURSE_CODE_RE);
    // A code only opens a course when it precedes the line's meeting time and
    // the line is not a labelled field. That keeps room numbers out: in
    // "MWF 10:10AM - 11:00AM  FGH 1034" and "Room: FGH 1034" the building code
    // is not the course.
    const time = parseTimeRange(line);
    const isCourseLine =
      m !== null &&
      m.index !== undefined &&
      m.index < (time?.index ?? Infinity) &&
      !LABEL_LINE_RE.test(line);
    if (m && isCourseLine) {
      const code = normalizeCode(m[1], m[2]);
      const existing = byCode.get(code);
      if (existing) {
        current = existing;
      } else {
        current = { code, lines: [] };
        byCode.set(code, current);
        blocks.push(current);
      }
      current.lines.push(line);
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  return { blocks, preamble };
}

function titleFor(block: Block, warnings: string[]): string {
  const [first, ...rest] = block.lines;
  // Text after the code on its own line, minus section/class-number noise.
  const codeMatch = first.match(COURSE_CODE_RE);
  if (codeMatch && codeMatch.index !== undefined) {
    let after = first.slice(codeMatch.index + codeMatch[0].length);
    after = after
      .replace(/^\s*-\s*[0-9]{2,3}[A-Z]?\b/, "") // "- 01"
      .replace(/\b(?:section|sect|sec)\s*[:.]?\s*[0-9]{1,3}[A-Z]?\b/i, "")
      .replace(/\(\s*\d{3,6}\s*\)/g, "") // class number in parens
      .replace(/\b(?:class\s*nbr|class\s*number)\s*[:.]?\s*\d+/i, "");
    // Stop at a cell boundary so a table row's later columns are not title.
    const cell = cells(after)[0] ?? "";
    const candidate = cleanTitle(cell);
    if (
      candidate.length >= 3 &&
      !parseTimeRange(candidate) &&
      !COURSE_CODE_RE.test(candidate) &&
      !LABEL_LINE_RE.test(candidate) &&
      /[A-Za-z]{3}/.test(candidate)
    ) {
      return candidate.slice(0, 160);
    }
  }
  // Otherwise the first following line that is prose, not a labelled field.
  for (const line of rest) {
    const candidate = cleanTitle(cells(line)[0] ?? "");
    if (
      candidate.length >= 3 &&
      !parseTimeRange(line) &&
      !COURSE_CODE_RE.test(candidate) &&
      !LABEL_LINE_RE.test(candidate) &&
      /[A-Za-z]{3}/.test(candidate)
    ) {
      return candidate.slice(0, 160);
    }
  }
  warnings.push("No course title found — using the course code. Add the real title before committing.");
  return block.code;
}

/**
 * Parses a pasted YES/VSTAR schedule into course candidates. Pure: no IO,
 * no database, no network.
 */
export function parseScheduleText(text: string): ParsedSchedule {
  const warnings: string[] = [];
  const raw = String(text ?? "").replace(/\r\n?/g, "\n");
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/ /g, " ").trimEnd())
    .filter((l) => l.trim().length > 0);

  if (!lines.length) {
    return { term: null, courses: [], warnings: ["Nothing to parse."] };
  }

  const termMatch = raw.match(TERM_RE);
  const term = termMatch
    ? `${termMatch[1][0].toUpperCase()}${termMatch[1].slice(1).toLowerCase()} ${termMatch[2]}`
    : null;

  const { blocks, preamble } = splitBlocks(lines);
  if (!blocks.length) {
    return {
      term,
      courses: [],
      warnings: [
        "No course codes found (expected something like “CS 1101”). Paste the schedule table or the printable class list from YES.",
      ],
    };
  }
  if (preamble.length > 6) {
    warnings.push(
      `${preamble.length} lines before the first course code were ignored (page header text).`,
    );
  }

  const courses: ParsedCourse[] = [];
  for (const block of blocks) {
    const blockText = block.lines.join("\n");
    const courseWarnings: string[] = [];
    const title = titleFor(block, courseWarnings);
    const fallbackKind: MeetingKind = /\blab(?:oratory)?\b/i.test(title)
      ? "LAB"
      : /\bseminar\b/i.test(title)
        ? "SEMINAR"
        : "LECTURE";

    const meetings: ParsedMeeting[] = [];
    const leftovers: string[] = [];
    for (const line of block.lines) {
      const parsed = parseMeetingLine(line, fallbackKind);
      if (parsed) {
        for (const m of parsed.meetings) {
          const dup = meetings.some(
            (x) =>
              x.dayOfWeek === m.dayOfWeek &&
              x.startTime === m.startTime &&
              x.endTime === m.endTime,
          );
          if (!dup) meetings.push(m);
        }
        leftovers.push(...parsed.leftovers);
      } else if (parseTimeRange(line)) {
        courseWarnings.push(
          `Found a time but no day on: “${line.trim().slice(0, 80)}”`,
        );
      }
    }

    if (!meetings.length) {
      courseWarnings.push(
        "No meeting days/times found — add them by hand, or this course will have no schedule.",
      );
    }
    if (meetings.some((m) => m.inferredMeridiem)) {
      courseWarnings.push(
        "AM/PM was inferred for at least one meeting — check the times.",
      );
    }

    const professor =
      extractProfessor(blockText) ?? leftovers.find(looksLikeName) ?? null;
    // Table layouts carry the unit count as a bare trailing cell ("3.00")
    // with no label for extractCredits to key off.
    const unlabelledUnits = leftovers.find((c) => /^\d(?:\.\d{1,2})?$/.test(c));
    const credits =
      extractCredits(blockText) ??
      (unlabelledUnits && Number(unlabelledUnits) > 0
        ? Number(unlabelledUnits)
        : null);
    const location =
      meetings.find((m) => m.location)?.location ??
      (blockText.match(/(?:room|location|building)\s*[:.]?\s*([^\n\t|]{2,60})/i)?.[1]
        ?.trim()
        .slice(0, 120) ??
        null);

    const confidence: ParseConfidence = !meetings.length
      ? "UNVERIFIED"
      : title === block.code || meetings.some((m) => m.inferredMeridiem)
        ? "LIKELY"
        : "VERIFIED";

    courses.push({
      code: block.code,
      title,
      section: extractSection(blockText),
      credits,
      professor,
      location,
      meetings: meetings.sort(
        (a, b) =>
          a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
      ),
      confidence,
      warnings: courseWarnings,
      sourceLines: block.lines.map((l) => l.trim().slice(0, 200)).slice(0, 12),
    });
  }

  // Overlap check across the whole paste — a schedule that double-books is
  // almost always a paste of two different terms.
  const seen: { code: string; day: number; start: number; end: number }[] = [];
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  for (const c of courses) {
    for (const m of c.meetings) {
      const s = toMin(m.startTime);
      const e = toMin(m.endTime);
      const clash = seen.find(
        (x) => x.day === m.dayOfWeek && x.code !== c.code && s < x.end && e > x.start,
      );
      if (clash) {
        warnings.push(
          `${c.code} overlaps ${clash.code} on the same day — check you pasted a single term's schedule.`,
        );
      }
      seen.push({ code: c.code, day: m.dayOfWeek, start: s, end: e });
    }
  }

  return { term, courses, warnings };
}

/** Count of distinct course codes mentioned anywhere in the text. */
export function countCourseCodes(text: string): number {
  const found = new Set<string>();
  for (const m of String(text ?? "").matchAll(COURSE_CODE_RE_G)) {
    found.add(normalizeCode(m[1], m[2]));
  }
  return found.size;
}
