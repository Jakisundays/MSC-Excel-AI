import { getSession } from "@/lib/auth";
import { listCompanyMembers, listPendingInvitations } from "@/lib/company";
import { TeamView } from "@/components/team-view";
import { CompanyOnboardingForm } from "@/components/company-onboarding-form";

export const metadata = { title: "Equipo" };

export default async function EquipoPage() {
  const session = await getSession();
  if (!session) return null;

  if (!session.company) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <CompanyOnboardingForm />
      </div>
    );
  }

  const [members, invitations] = await Promise.all([
    listCompanyMembers(session.company),
    session.companyRole === "owner" || session.companyRole === "admin"
      ? listPendingInvitations(session.company)
      : Promise.resolve([]),
  ]);

  return (
    <TeamView
      members={members}
      invitations={invitations}
      viewerRole={(session.companyRole || "member") as "owner" | "admin" | "member"}
      viewerUserId={session.id}
    />
  );
}
