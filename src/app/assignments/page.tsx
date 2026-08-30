// ASSIGNMENTS — intelligence + tracking. Every assignment in the current
// semester with the priority engine's score/reason, inline status changes,
// and one-click session planning.

import Link from "next/link";
import { db } from "@/lib/db";
import {
  getCourses,
  getCurrentSemester,
  getRankedActions,
} from "@/lib/data/queries";
import { PageHeader } from "@/components/ui";
import AssignmentTable, {
  type AssignmentRowData,
  type CourseOption,
} from "@/components/AssignmentTable";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"];

export default async function AssignmentsPage() {
  const now = new Date();
  const semester = await getCurrentSemester();
  const [assignments, courses, ranked] = await Promise.all([
    db.assignment.findMany({
      where: semester ? { course: { semesterId: semester.id } } : undefined,
      include: { course: true },
      orderBy: { dueAt: "asc" },
    }),
    getCourses(),
    getRankedActions(now),
  ]);

  // Map engine output (score / priority / reason) onto assignment ids.
  const rankById = new Map(
    ranked.all
      .filter((r) => r.entityType === "ASSIGNMENT")
      .map((r) => [r.id, r] as const),
  );

  // Due-date ascending with undated items last (SQLite sorts nulls first).
  const ordered = [...assignments].sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return a.dueAt.getTime() - b.dueAt.getTime();
  });

  const rows: AssignmentRowData[] = ordered.map((a) => {
    const r = rankById.get(a.id);
    return {
      id: a.id,
      title: a.title,
      kind: a.kind,
      status: a.status,
      dueAt: a.dueAt ? a.dueAt.toISOString() : null,
      estMinutes: a.estMinutes,
      estMinutesMax: a.estMinutesMax,
      gradeWeight: a.gradeWeight,
      courseId: a.courseId,
      courseCode: a.course.code,
      courseColor: a.course.color,
      score: r?.score ?? null,
      priority: r?.priority ?? null,
      reason: r?.reason ?? null,
    };
  });

  const courseOptions: CourseOption[] = courses.map((c) => ({
    id: c.id,
    code: c.code,
    color: c.color,
  }));

  const openCount = rows.filter((r) => OPEN_STATUSES.includes(r.status)).length;

  return (
    <div>
      <PageHeader
        title="Assignments"
        subtitle={`${openCount} open · ${rows.length} total${semester ? ` · ${semester.name}` : ""}`}
        action={
          <Link
            href="/assignments/new"
            className="rounded-md bg-[var(--gold-deep)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            + New assignment
          </Link>
        }
      />
      <AssignmentTable rows={rows} courses={courseOptions} />
    </div>
  );
}
