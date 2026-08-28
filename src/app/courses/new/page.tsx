// ADD COURSE — CourseForm in create mode.

import { getCurrentSemester } from "@/lib/data/queries";
import { Card, PageHeader } from "@/components/ui";
import CourseForm from "@/components/CourseForm";

export const dynamic = "force-dynamic";

export default async function NewCoursePage() {
  const semester = await getCurrentSemester();

  return (
    <div>
      <PageHeader
        title="Add course"
        subtitle={
          semester
            ? `Added to ${semester.name}. Color is assigned automatically.`
            : "A semester will be created automatically for today's term."
        }
      />
      <Card>
        <CourseForm />
      </Card>
    </div>
  );
}
