import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import ClubForm from "@/components/ClubForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EditClubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const club = await db.club.findUnique({ where: { id } });
  if (!club) notFound();

  return (
    <div>
      <PageHeader title={`Edit ${club.name}`} />
      <ClubForm
        clubId={club.id}
        initial={{
          name: club.name,
          category: club.category,
          description: club.description ?? "",
          website: club.website ?? "",
          applicationUrl: club.applicationUrl ?? "",
          meetingInfo: club.meetingInfo ?? "",
          recruitment: club.recruitment ?? "",
          interviewProcess: club.interviewProcess ?? "",
          requirements: club.requirements ?? "",
          contact: club.contact ?? "",
          source: club.source ?? "",
        }}
      />
    </div>
  );
}
