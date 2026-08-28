// Heuristic chat answers — the no-API-key path for "Ask College OS" (also the
// fallback when Claude errors). Pattern-matches the question's intent and
// answers strictly from the same context pack the AI would see, always citing
// concrete titles, dates, and minutes. Plain text only: numbered/bulleted
// lines, no markdown headers.

import type { getChatContextPack } from "@/lib/data/queries";
import {
  addDays,
  daysUntil,
  dueLabel,
  endOfDay,
  fmtDay,
  fmtMinutes,
  fmtTime,
  isSameDay,
  weekBounds,
} from "@/lib/dates";

/** The snapshot the chat answers from. `upcomingEvents` is an optional
 *  extension the chat API route adds (next 30 days of calendar events). */
export type ChatContextPack = Awaited<
  ReturnType<typeof getChatContextPack>
> & {
  upcomingEvents?: {
    title: string;
    category: string;
    startAt: Date | string;
    location?: string | null;
  }[];
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

type Dateish = Date | string | null | undefined;

function toDate(v: Dateish): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function whenPhrase(d: Date, now: Date): string {
  const days = daysUntil(d, now);
  if (days < 0) return `${-days}d ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days (${fmtDay(d)})`;
}

function clip(text: string, max = 220): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Intent router
// ---------------------------------------------------------------------------

export function heuristicAnswer(question: string, pack: ChatContextPack): string {
  const q = question.toLowerCase();
  const now = toDate(pack.currentTime) ?? new Date();

  // Order matters: specific intents first so e.g. "what should I do if I only
  // have 2 hours tonight" hits the time-budget branch, not the generic one,
  // and "what should I study tonight" hits studying, not the budget branch.
  if (/study|exam|test|quiz/.test(q)) return studyAnswer(pack, now);
  if (/prepare|before.*class|economics|next class/.test(q)) return prepAnswer(q, pack);
  if (/deadline|due|next week|coming up/.test(q)) return deadlineAnswer(q, pack, now);
  if (/falling behind|behind|overdue|missed/.test(q)) return behindAnswer(pack, now);
  if (/2 hours|only have|tonight/.test(q)) return budgetAnswer(q, pack, now);
  if (/what should i do|top action|priorit/.test(q)) return actionsAnswer(pack, now);
  if (/club|research|startup|career/.test(q)) return categoryAnswer(q, pack, now);
  return briefingAnswer(pack, now);
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

function studyAnswer(pack: ChatContextPack, now: Date): string {
  const lines: string[] = [];
  const exams = pack.upcomingExams.slice(0, 4);

  if (exams.length === 0) {
    lines.push("No exams or quizzes on your calendar for the next 30 days.");
  } else {
    lines.push("Upcoming exams:");
    exams.forEach((e, i) => {
      const at = toDate(e.startAt);
      lines.push(
        `${i + 1}. ${e.course} ${e.title} — ${at ? whenPhrase(at, now) : "date TBD"}` +
          (e.weight ? `, ${e.weight}% of grade` : "") +
          (e.hasStudyPlan ? "" : " — no study plan yet (generate one from the exam page)"),
      );
    });
  }

  const near = pack.plannedSessionsNext7Days.filter((s) => {
    if (s.completed || s.kind !== "EXAM_STUDY") return false;
    const d = toDate(s.date);
    if (!d) return false;
    const days = daysUntil(d, now);
    return days >= 0 && days <= 1;
  });
  if (near.length) {
    lines.push("", "Study sessions planned for today/tomorrow:");
    for (const s of near.slice(0, 5)) {
      const d = toDate(s.date);
      const day = d && daysUntil(d, now) === 0 ? "Today" : "Tomorrow";
      lines.push(`- ${day}: ${s.focus} (${fmtMinutes(s.minutes)})`);
    }
  } else if (exams.length) {
    lines.push("", "No exam-study sessions are planned for today or tomorrow.");
  }

  const rationale = exams.find((e) => e.planRationale)?.planRationale;
  if (rationale) lines.push("", `Why this plan: ${clip(rationale)}`);

  return lines.join("\n");
}

function prepAnswer(q: string, pack: ChatContextPack): string {
  let preps = pack.beforeClassPrep;

  // If the question names a course (code or a distinctive title word), narrow.
  const named = pack.courses.filter((c) => {
    const words = [
      c.code.toLowerCase(),
      ...c.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3),
    ];
    return words.some((w) => q.includes(w));
  });
  if (named.length) {
    const codes = new Set(named.map((c) => c.code));
    const narrowed = preps.filter((p) => codes.has(p.course));
    if (narrowed.length) preps = narrowed;
  }

  if (!preps.length) {
    return "No before-class prep is queued right now — there's nothing outstanding ahead of your next class meetings.";
  }

  const lines = ["Before your next classes:"];
  preps.slice(0, 4).forEach((p, i) => {
    const at = toDate(p.meetingStart);
    const when = at ? `${fmtDay(at)} ${fmtTime(at)}` : "next meeting";
    const total = p.totalMinutes > 0 ? ` (~${fmtMinutes(p.totalMinutes)} total)` : "";
    lines.push(`${i + 1}. ${p.course} — ${when}${total}:`);
    for (const item of p.items.slice(0, 4)) lines.push(`   - ${item}`);
    if (!p.items.length) lines.push("   - Nothing specific queued — skim your last notes.");
  });
  return lines.join("\n");
}

function deadlineAnswer(q: string, pack: ChatContextPack, now: Date): string {
  let start = now;
  let end = endOfDay(addDays(now, 14));
  let label = "in the next 14 days";
  if (/next week/.test(q)) {
    const wb = weekBounds(addDays(weekBounds(now).end, 1));
    start = wb.start;
    end = wb.end;
    label = `next week (${fmtDay(wb.start)} – ${fmtDay(wb.end)})`;
  } else if (/this week/.test(q)) {
    end = weekBounds(now).end;
    label = "by the end of this week";
  } else if (/tomorrow/.test(q)) {
    end = endOfDay(addDays(now, 1));
    label = "by end of day tomorrow";
  } else if (/today|tonight/.test(q)) {
    end = endOfDay(now);
    label = "today";
  }

  const due = pack.openAssignments
    .map((a) => ({ a, d: toDate(a.dueAt) }))
    .filter((x) => x.d && x.d >= start && x.d <= end)
    .sort((x, y) => x.d!.getTime() - y.d!.getTime());
  const examsIn = pack.upcomingExams
    .map((e) => ({ e, d: toDate(e.startAt) }))
    .filter((x) => x.d && x.d >= start && x.d <= end);
  const overdue = pack.openAssignments.filter((a) => {
    const d = toDate(a.dueAt);
    return d && d < now;
  });

  const lines: string[] = [];
  if (!due.length && !examsIn.length) {
    const next = pack.openAssignments
      .map((a) => ({ a, d: toDate(a.dueAt) }))
      .filter((x) => x.d && x.d > end)
      .sort((x, y) => x.d!.getTime() - y.d!.getTime())[0];
    lines.push(
      `Nothing is due ${label}.` +
        (next
          ? ` Next up after that: ${next.a.course}: ${next.a.title}, ${dueLabel(next.d!, now)}.`
          : " Your deadline runway is clear."),
    );
  } else {
    if (due.length) {
      lines.push(`Due ${label}:`);
      for (const { a, d } of due.slice(0, 7)) {
        lines.push(
          `- ${a.course}: ${a.title} — ${dueLabel(d!, now)}` +
            (a.estMinutes ? ` (~${fmtMinutes(a.estMinutes)})` : "") +
            (a.gradeWeight ? `, ${a.gradeWeight}% of grade` : ""),
        );
      }
    }
    if (examsIn.length) {
      lines.push(due.length ? "" : `Deadlines ${label}:`, "Also in that window:");
      for (const { e, d } of examsIn.slice(0, 3)) {
        lines.push(`- ${e.course} ${e.title} on ${fmtDay(d!)}${e.weight ? ` (${e.weight}% of grade)` : ""}`);
      }
    }
  }
  if (overdue.length) {
    lines.push(
      "",
      `Heads up: ${overdue.length} item${overdue.length === 1 ? " is" : "s are"} already overdue — ask "am I falling behind?" for the list.`,
    );
  }
  return lines.filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n");
}

function behindAnswer(pack: ChatContextPack, now: Date): string {
  const overdue = pack.openAssignments
    .map((a) => ({ a, d: toDate(a.dueAt) }))
    .filter((x) => x.d && x.d < now);
  const overdueTitles = new Set(overdue.map((x) => x.a.title));
  const blocked = pack.openAssignments.filter(
    (a) => a.status === "BLOCKED" && !overdueTitles.has(a.title),
  );
  const unplanned = pack.upcomingExams.filter((e) => {
    const d = toDate(e.startAt);
    return !e.hasStudyPlan && d && daysUntil(d, now) <= 10;
  });
  const urgent = pack.activeAlerts.filter((a) => a.severity === "URGENT");

  if (!overdue.length && !blocked.length && !unplanned.length && !urgent.length) {
    const nextTop = pack.topActionsToday[0];
    const nextExam = pack.upcomingExams[0];
    const d = nextExam ? toDate(nextExam.startAt) : null;
    return (
      "You're on track: nothing overdue, nothing blocked, no unplanned exams, and no urgent alerts." +
      (nextTop ? ` Keep momentum with your #1 action: ${nextTop.title}.` : "") +
      (nextExam && d ? ` Next exam is ${nextExam.course} ${nextExam.title} ${whenPhrase(d, now)}.` : "")
    );
  }

  const lines: string[] = [];
  if (overdue.length) {
    lines.push("Overdue:");
    for (const { a, d } of overdue.slice(0, 5)) {
      lines.push(`- ${a.course}: ${a.title} — ${dueLabel(d!, now)}`);
    }
  }
  if (blocked.length) {
    lines.push("Blocked:");
    for (const a of blocked.slice(0, 4)) lines.push(`- ${a.course}: ${a.title}`);
  }
  if (unplanned.length) {
    lines.push("Exams within 10 days that have no study plan:");
    for (const e of unplanned.slice(0, 4)) {
      const d = toDate(e.startAt);
      lines.push(`- ${e.course} ${e.title}${d ? ` — ${whenPhrase(d, now)}` : ""}`);
    }
  }
  if (urgent.length) {
    lines.push("Urgent alerts:");
    for (const a of urgent.slice(0, 4)) lines.push(`- ${a.title}: ${clip(a.body, 120)}`);
  }
  lines.push("", "Start with the overdue items — knocking out the oldest one first usually unblocks the rest.");
  return lines.join("\n");
}

function budgetAnswer(q: string, pack: ChatContextPack, now: Date): string {
  const hourMatch = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/.exec(q);
  const minMatch = /(\d+)\s*min/.exec(q);
  const budget = hourMatch
    ? Math.round(parseFloat(hourMatch[1]) * 60)
    : minMatch
      ? parseInt(minMatch[1], 10)
      : 120;

  if (!pack.topActionsToday.length) {
    return "Nothing is ranked right now — add assignments, exams, or tasks and I'll fill the time for you.";
  }

  let remaining = budget;
  const picked: { title: string; courseCode?: string; minutes: number; due: Date | null }[] = [];
  for (const a of pack.topActionsToday) {
    if (!a.estMinutes || a.estMinutes <= 0) continue;
    if (a.estMinutes <= remaining) {
      picked.push({
        title: a.title,
        courseCode: a.courseCode,
        minutes: a.estMinutes,
        due: toDate(a.dueAt),
      });
      remaining -= a.estMinutes;
    }
    if (remaining < 15) break;
  }

  if (!picked.length) {
    const first = pack.topActionsToday[0];
    return (
      `None of your top actions has an estimate that fits ${fmtMinutes(budget)} cleanly, so put the whole block into your #1 priority: ` +
      `${first.title}${first.courseCode ? ` (${first.courseCode})` : ""}. ${first.reason}`
    );
  }

  const lines = [`Best use of ${fmtMinutes(budget)}, in priority order:`];
  picked.forEach((p, i) => {
    lines.push(
      `${i + 1}. ${p.title}${p.courseCode ? ` (${p.courseCode})` : ""} — ${fmtMinutes(p.minutes)}` +
        (p.due ? `, ${dueLabel(p.due, now)}` : ""),
    );
  });
  const used = budget - remaining;
  lines.push(
    "",
    remaining > 0
      ? `That's ${fmtMinutes(used)} of focused work with ${fmtMinutes(remaining)} of buffer for breaks.`
      : `That fills the full ${fmtMinutes(budget)}.`,
  );
  return lines.join("\n");
}

function actionsAnswer(pack: ChatContextPack, now: Date): string {
  if (!pack.topActionsToday.length) {
    return "Nothing is ranked yet — add courses, assignments, or exams and the priority engine will build your top actions.";
  }
  const lines = ["Your top actions right now:"];
  pack.topActionsToday.slice(0, 5).forEach((a, i) => {
    const d = toDate(a.dueAt);
    lines.push(
      `${i + 1}. ${a.title}${a.courseCode ? ` (${a.courseCode})` : ""}` +
        (d ? ` — ${dueLabel(d, now)}` : "") +
        (a.estMinutes ? `, ~${fmtMinutes(a.estMinutes)}` : ""),
    );
    lines.push(`   Why: ${a.reason}`);
  });
  return lines.join("\n");
}

function categoryAnswer(q: string, pack: ChatContextPack, now: Date): string {
  const CATS: [RegExp, string][] = [
    [/club/, "CLUB"],
    [/research/, "RESEARCH"],
    [/startup/, "STARTUP"],
    [/career|intern|recruit/, "CAREER"],
  ];
  const matched = CATS.filter(([re]) => re.test(q)).map(([, c]) => c);
  const cats = new Set(matched.length ? matched : ["CLUB", "CAREER", "RESEARCH", "STARTUP"]);

  const tasks = pack.openTasks.filter((t) => cats.has(t.category));
  const goals = pack.longTermGoals.filter((g) => cats.has(g.category));
  const events = (pack.upcomingEvents ?? []).filter((e) => cats.has(e.category));

  const lines: string[] = [];

  // Phase 2: the club database + application pipeline answer club questions.
  if (cats.has("CLUB")) {
    const clubs = pack.clubs ?? [];
    const apps = pack.clubApplications ?? [];
    const recruiting = apps.filter((a) =>
      ["NOT_OPEN", "OPEN", "APPLYING"].includes(a.status),
    );
    if (recruiting.length) {
      lines.push("Club applications in play:");
      for (const a of recruiting.slice(0, 5)) {
        const d = toDate(a.deadlineAt);
        lines.push(
          `- ${a.club} — ${a.status.replace(/_/g, " ").toLowerCase()}${d ? `, ${dueLabel(d, now)}` : ""}`,
        );
      }
    }
    const high = clubs.filter((c) => c.priority === "HIGH" && !["MEMBER", "LEADER"].includes(c.membership));
    if (high.length) {
      lines.push("High-priority clubs to pursue:");
      for (const c of high.slice(0, 4)) {
        lines.push(`- ${c.name}${c.priorityReason ? ` — ${c.priorityReason}` : ""}`);
      }
    } else if (clubs.length && matched.includes("CLUB")) {
      lines.push(
        `Tracking ${clubs.length} clubs — see /clubs for the ranked list (rankings are computed against your interests there).`,
      );
    }
  }

  if (tasks.length) {
    lines.push("Open tasks:");
    for (const t of tasks.slice(0, 5)) {
      const d = toDate(t.dueAt);
      lines.push(`- ${t.title}${d ? ` — ${dueLabel(d, now)}` : ""} (${t.category.toLowerCase()})`);
    }
  }
  if (events.length) {
    lines.push("Upcoming events:");
    for (const e of events.slice(0, 4)) {
      const d = toDate(e.startAt);
      lines.push(`- ${e.title}${d ? ` — ${fmtDay(d)}` : ""}${e.location ? `, ${e.location}` : ""}`);
    }
  }
  if (goals.length) {
    lines.push("Active goals:");
    for (const g of goals.slice(0, 4)) {
      lines.push(`- ${g.title} (tier ${g.tier}, ${g.progress}% along)`);
    }
  }
  if (!lines.length) {
    lines.push("Nothing tracked in that area yet — add tasks, events, or goals and they'll show up here.");
  }
  lines.push(
    "",
    "Club intelligence is live on /clubs (rankings, applications, watched pages). Deeper career, research, and startup intelligence arrives in Phases 3–5.",
  );
  return lines.join("\n");
}

function briefingAnswer(pack: ChatContextPack, now: Date): string {
  const lines: string[] = [];

  const top = pack.topActionsToday.slice(0, 3);
  if (top.length) {
    lines.push("Top priorities:");
    top.forEach((a, i) => {
      const d = toDate(a.dueAt);
      lines.push(
        `${i + 1}. ${a.title}${a.courseCode ? ` (${a.courseCode})` : ""}${d ? ` — ${dueLabel(d, now)}` : ""}`,
      );
    });
  }

  const nextExam = pack.upcomingExams[0];
  if (nextExam) {
    const d = toDate(nextExam.startAt);
    lines.push(`Next exam: ${nextExam.course} ${nextExam.title}${d ? ` ${whenPhrase(d, now)}` : ""}.`);
  }

  const today = pack.plannedSessionsNext7Days.filter((s) => {
    const d = toDate(s.date);
    return d && isSameDay(d, now) && !s.completed;
  });
  if (today.length) {
    lines.push(
      `Planned today: ${today
        .slice(0, 3)
        .map((s) => `${s.focus} (${fmtMinutes(s.minutes)})`)
        .join("; ")}.`,
    );
  }

  if (pack.activeAlerts.length) {
    lines.push(
      `${pack.activeAlerts.length} active alert${pack.activeAlerts.length === 1 ? "" : "s"} — first: ${pack.activeAlerts[0].title}.`,
    );
  }

  if (!lines.length) {
    return "Your slate is clear — no ranked actions, upcoming exams, planned sessions, or alerts. Add courses and assignments to get started.";
  }
  lines.push("", 'Ask me things like "what\'s due next week?" or "what should I study tonight?" for detail.');
  return lines.join("\n");
}
