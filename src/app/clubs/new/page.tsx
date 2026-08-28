import ClubForm from "@/components/ClubForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function NewClubPage() {
  return (
    <div>
      <PageHeader
        title="Add a club"
        subtitle="Record what you can verify; leave the rest blank and note your source"
      />
      <ClubForm />
    </div>
  );
}
