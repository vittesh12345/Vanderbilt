// Edit exam — server-loads the exam + courses, feeds the form.

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCourses } from "@/lib/data/queries";
import { parseJson } from "@/lib/json";
import { PageHeader } from "@/components/ui";
import ExamForm from "@/components/ExamForm";

export const dynamic = "force-dynamic";

export default async function EditExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [exam, courses] = await Promise.all([
    db.exam.findUnique({ where: { id }, include: { course: true } }),
    getCourses(),
  ]);
  if (!exam) notFound();

  const topics = parseJson<string[]>(exam.topicsJson, []);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Edit exam"
        subtitle={`${exam.course.code} · ${exam.title}`}
      />
      <ExamForm
        courses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title }))}
        initial={{
          id: exam.id,
          courseId: exam.courseId,
          title: exam.title,
          kind: exam.kind,
          startAt: exam.startAt.toISOString(),
          endAt: exam.endAt ? exam.endAt.toISOString() : null,
          location: exam.location ?? "",
          weight: exam.weight,
          topicsText: topics.join("\n"),
          notes: exam.notes ?? "",
        }}
      />
    </div>
  );
}
