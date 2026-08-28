// Edit assignment — server-loads the assignment + courses, feeds the form.

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCourses } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui";
import AssignmentForm from "@/components/AssignmentForm";

export const dynamic = "force-dynamic";

export default async function EditAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [assignment, courses] = await Promise.all([
    db.assignment.findUnique({ where: { id }, include: { course: true } }),
    getCourses(),
  ]);
  if (!assignment) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Edit assignment"
        subtitle={`${assignment.course.code} · ${assignment.title}`}
      />
      <AssignmentForm
        courses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title }))}
        initial={{
          id: assignment.id,
          courseId: assignment.courseId,
          title: assignment.title,
          kind: assignment.kind,
          description: assignment.description ?? "",
          dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
          difficulty: assignment.difficulty,
          importance: assignment.importance,
          gradeWeight: assignment.gradeWeight,
          estMinutes: assignment.estMinutes,
          estMinutesMax: assignment.estMinutesMax,
          status: assignment.status,
          notes: assignment.notes ?? "",
        }}
      />
    </div>
  );
}
