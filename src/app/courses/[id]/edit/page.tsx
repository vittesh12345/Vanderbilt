// EDIT COURSE — CourseForm in edit mode (also carries the Delete button).

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/json";
import type { CourseLink, GradeWeight, OfficeHour } from "@/lib/types";
import { Card, CourseDot, PageHeader } from "@/components/ui";
import CourseForm, { type CourseFormInitial } from "@/components/CourseForm";

export const dynamic = "force-dynamic";

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const course = await db.course.findUnique({
    where: { id },
    include: { meetings: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
  });
  if (!course) notFound();

  const initial: CourseFormInitial = {
    code: course.code,
    title: course.title,
    professor: course.professor ?? "",
    professorEmail: course.professorEmail ?? "",
    location: course.location ?? "",
    credits: course.credits,
    difficulty: course.difficulty,
    targetGrade: course.targetGrade ?? "",
    notes: course.notes ?? "",
    meetings: course.meetings.map((m) => ({
      dayOfWeek: m.dayOfWeek,
      startTime: m.startTime,
      endTime: m.endTime,
      kind: m.kind,
      location: m.location,
    })),
    gradeWeights: parseJson<GradeWeight[]>(course.gradeWeightsJson, []),
    officeHours: parseJson<OfficeHour[]>(course.officeHoursJson, []),
    links: parseJson<CourseLink[]>(course.linksJson, []),
  };

  return (
    <div>
      <PageHeader
        title={`Edit ${course.code}`}
        subtitle={course.title}
        action={<CourseDot color={course.color} />}
      />
      <Card>
        <CourseForm courseId={course.id} initial={initial} />
      </Card>
    </div>
  );
}
