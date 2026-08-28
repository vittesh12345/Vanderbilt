// New assignment — server-loads the semester's courses for the select.

import { getCourses } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui";
import AssignmentForm from "@/components/AssignmentForm";

export const dynamic = "force-dynamic";

export default async function NewAssignmentPage() {
  const courses = await getCourses();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New assignment"
        subtitle="Leave the estimate blank and College OS will size it for you."
      />
      <AssignmentForm
        courses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title }))}
      />
    </div>
  );
}
