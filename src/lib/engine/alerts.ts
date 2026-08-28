// Proactive alert engine.
//
// Alerts are DERIVED, never stored: this module recomputes them from live
// data on every read so they cannot go stale. Only dismissals persist
// (DismissedAlert rows keyed by each alert's stable `key`). Deadline-tier
// keys include a day bucket so dismissing today's nudge doesn't suppress
// tomorrow's escalation.

import { format } from "date-fns";
import { daysUntil } from "@/lib/dates";
import type { AlertItem, HeavyWeek } from "@/lib/types";

export interface AlertInputs {
  now?: Date;
  assignments: {
    id: string;
    title: string;
    courseCode: string;
    dueAt: Date | null;
    status: string;
  }[];
  exams: {
    id: string;
    title: string;
    courseCode: string;
    startAt: Date;
    planGeneratedAt: Date | null;
  }[];
  tasks: {
    id: string;
    title: string;
    category: string;
    dueAt: Date | null;
    status: string;
    /** Where in the app to act on it (defaults to /long-term). */
    href?: string;
  }[];
  openConflicts: { id: string; description: string; suggestion: string | null }[];
  heavyWeeks: HeavyWeek[];
  needsReviewTopics: { id: string; name: string; courseCode: string }[];
  /** Club applications with open/deadline dates (Phase 2). */
  clubApplications?: {
    id: string;
    clubName: string;
    status: string; // NOT_OPEN | OPEN | APPLYING | SUBMITTED | INTERVIEW | ...
    opensAt: Date | null;
    deadlineAt: Date | null;
    interviewAt: Date | null;
  }[];
  /** Monitored sources that changed recently (Phase 2 web monitoring). */
  changedSources?: {
    id: string;
    label: string;
    changedAt: Date;
    summary: string | null;
  }[];
  /** Planned minutes this week vs. the profile's weekly budget. */
  plannedWeekMinutes?: number;
  weeklyBudgetMinutes?: number;
}

const OPEN = new Set(["NOT_STARTED", "IN_PROGRESS", "BLOCKED"]);

function bucket(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function computeAlerts(inputs: AlertInputs): AlertItem[] {
  const now = inputs.now ?? new Date();
  const todayBucket = bucket(now);
  const alerts: AlertItem[] = [];

  const deadlineTier = (
    days: number,
  ): { kind: AlertItem["kind"]; severity: AlertItem["severity"]; hint: string } | null => {
    if (days < 0) return { kind: "OVERDUE", severity: "URGENT", hint: "This is overdue." };
    if (days === 0) return { kind: "DUE_TODAY", severity: "URGENT", hint: "Due today." };
    if (days === 1)
      return { kind: "DEADLINE_1D", severity: "URGENT", hint: "Deadline tomorrow." };
    if (days <= 3)
      return { kind: "DEADLINE_3D", severity: "WARNING", hint: "High priority — due soon." };
    if (days <= 7)
      return { kind: "DEADLINE_7D", severity: "INFO", hint: "Start preparing." };
    return null;
  };

  for (const a of inputs.assignments) {
    if (!a.dueAt || !OPEN.has(a.status)) continue;
    const tier = deadlineTier(daysUntil(a.dueAt, now));
    if (!tier) continue;
    alerts.push({
      key: `${tier.kind}:assignment:${a.id}:${todayBucket}`,
      kind: tier.kind,
      severity: tier.severity,
      title: `${a.courseCode}: ${a.title}`,
      body: tier.hint,
      href: "/assignments",
      at: a.dueAt,
    });
  }

  for (const t of inputs.tasks) {
    if (!t.dueAt || t.status === "COMPLETED") continue;
    const tier = deadlineTier(daysUntil(t.dueAt, now));
    if (!tier) continue;
    alerts.push({
      key: `${tier.kind}:task:${t.id}:${todayBucket}`,
      kind: tier.kind,
      severity: tier.severity,
      title: t.title,
      body: `${tier.hint} (${t.category.toLowerCase()})`,
      href: t.href ?? "/long-term",
      at: t.dueAt,
    });
  }

  for (const e of inputs.exams) {
    const days = daysUntil(e.startAt, now);
    if (days < 0) continue;
    if (days <= 7 && !e.planGeneratedAt) {
      alerts.push({
        key: `UNPLANNED_EXAM:${e.id}`,
        kind: "UNPLANNED_EXAM",
        severity: days <= 3 ? "URGENT" : "WARNING",
        title: `${e.courseCode} ${e.title} in ${days} day${days === 1 ? "" : "s"} — no study plan`,
        body: "Generate a study plan so prep gets scheduled before it's too late.",
        href: "/exams",
        at: e.startAt,
      });
    } else if (days <= 3) {
      alerts.push({
        key: `EXAM_SOON:${e.id}:${todayBucket}`,
        kind: "EXAM_SOON",
        severity: "WARNING",
        title: `${e.courseCode} ${e.title} — ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
        body: "Stick to the study plan; today's session is on the dashboard.",
        href: "/exams",
        at: e.startAt,
      });
    }
  }

  // Club applications: opening soon, deadline tiers, interview prep.
  const APP_ACTIVE = new Set(["NOT_OPEN", "OPEN", "APPLYING"]);
  for (const app of inputs.clubApplications ?? []) {
    if (app.opensAt && app.status === "NOT_OPEN") {
      const days = daysUntil(app.opensAt, now);
      if (days >= 0 && days <= 7) {
        alerts.push({
          key: `APP_OPENS:${app.id}:${todayBucket}`,
          kind: "APP_OPENS",
          severity: "INFO",
          title: `${app.clubName} application opens ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
          body: "Draft your materials before it opens.",
          href: "/clubs",
          at: app.opensAt,
        });
      }
    }
    if (app.deadlineAt && APP_ACTIVE.has(app.status)) {
      const tier = deadlineTier(daysUntil(app.deadlineAt, now));
      if (tier) {
        alerts.push({
          key: `${tier.kind}:club-app:${app.id}:${todayBucket}`,
          kind: tier.kind,
          severity: tier.severity,
          title: `${app.clubName} application`,
          body: `${tier.hint} (club application)`,
          href: "/clubs",
          at: app.deadlineAt,
        });
      }
    }
    if (app.interviewAt && app.status === "INTERVIEW") {
      const days = daysUntil(app.interviewAt, now);
      if (days >= 0 && days <= 4) {
        alerts.push({
          key: `DEADLINE_3D:club-interview:${app.id}:${todayBucket}`,
          kind: "DEADLINE_3D",
          severity: days <= 1 ? "URGENT" : "WARNING",
          title: `${app.clubName} interview ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
          body: "Prepare interview answers.",
          href: "/clubs",
          at: app.interviewAt,
        });
      }
    }
  }

  // Web monitoring: a watched page meaningfully changed.
  for (const src of inputs.changedSources ?? []) {
    alerts.push({
      key: `SOURCE_CHANGED:${src.id}:${bucket(src.changedAt)}`,
      kind: "SOURCE_CHANGED",
      severity: "INFO",
      title: `Watched page changed: ${src.label}`,
      body: src.summary ?? "Content changed since the last check — review it.",
      href: "/settings",
      at: src.changedAt,
    });
  }

  for (const w of inputs.heavyWeeks) {
    alerts.push({
      key: `HEAVY_WEEK:${bucket(w.start)}`,
      kind: "HEAVY_WEEK",
      severity: "WARNING",
      title: `Heavy week detected: ${format(w.start, "MMM d")}–${format(w.end, "MMM d")}`,
      body:
        `${w.assignments} assignment${w.assignments === 1 ? "" : "s"}, ${w.quizzes} quiz${w.quizzes === 1 ? "" : "zes"}, ${w.exams} exam${w.exams === 1 ? "" : "s"}` +
        (w.applications ? `, ${w.applications} application deadlines` : "") +
        (w.recommendations.length ? `. ${w.recommendations[0]}` : ""),
      href: "/upcoming",
      at: w.start,
    });
  }

  for (const c of inputs.openConflicts) {
    alerts.push({
      key: `CONFLICT:${c.id}`,
      kind: "CONFLICT",
      severity: "WARNING",
      title: "Conflict detected between sources",
      body: `${c.description}${c.suggestion ? ` — ${c.suggestion}` : ""}`,
      href: "/syllabus",
    });
  }

  if (inputs.needsReviewTopics.length >= 3) {
    const names = inputs.needsReviewTopics.slice(0, 3).map((t) => t.name);
    alerts.push({
      key: `NEEDS_REVIEW:${todayBucket}`,
      kind: "NEEDS_REVIEW",
      severity: "INFO",
      title: `${inputs.needsReviewTopics.length} topics flagged "needs review"`,
      body: `${names.join(", ")}${inputs.needsReviewTopics.length > 3 ? ", …" : ""} — schedule a review session.`,
      href: "/planner",
    });
  }

  if (
    inputs.plannedWeekMinutes !== undefined &&
    inputs.weeklyBudgetMinutes !== undefined &&
    inputs.weeklyBudgetMinutes > 0 &&
    inputs.plannedWeekMinutes > inputs.weeklyBudgetMinutes
  ) {
    const over = Math.round(
      ((inputs.plannedWeekMinutes - inputs.weeklyBudgetMinutes) /
        inputs.weeklyBudgetMinutes) * 100,
    );
    alerts.push({
      key: `OVERCOMMITMENT:${todayBucket.slice(0, 7)}`,
      kind: "OVERCOMMITMENT",
      severity: "WARNING",
      title: "Overcommitment risk",
      body: `This week's planned work exceeds your weekly budget by ${over}%. Consider deferring low-tier commitments.`,
      href: "/long-term",
    });
  }

  const rank = { URGENT: 0, WARNING: 1, INFO: 2 } as const;
  return alerts.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity),
  );
}
