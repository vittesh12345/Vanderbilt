// New exam — server-loads the semester's courses for the select.

import { getCourses } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui";
import ExamForm from "@/components/ExamForm";

export const dynamic = "force-dynamic";

export default async function NewExamPage() {
  const courses = await getCourses();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New exam"
        subtitle="List the topics in scope so the study planner can split them across sessions."
      />
      <ExamForm
        courses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title }))}
      />
    </div>
  );
}
