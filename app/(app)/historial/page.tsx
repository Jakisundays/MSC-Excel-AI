import { getSession } from "@/lib/auth";
import { searchSubmissions } from "@/lib/submissions";
import type { SubmissionsScope } from "@/lib/submissions";
import { listCompanyMembers } from "@/lib/company";
import { HistorialView } from "@/components/historial-view";
import { NotificationOptInBanner } from "@/components/notification-opt-in-banner";
import type { SubmissionStatus } from "@/lib/pocketbase/types";

export const metadata = { title: "Historial" };

const STATUSES = new Set<SubmissionStatus>(["pending", "processing", "completed", "failed"]);

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const session = await getSession();

  if (!session) {
    return (
      <>
        <NotificationOptInBanner />
        <HistorialView initialResult={null} initialParams={{}} members={[]} error />
      </>
    );
  }

  const scope: SubmissionsScope = sp.scope === "team" ? "team" : "mine";
  const memberId = sp.member || undefined;
  const status: SubmissionStatus | "all" = STATUSES.has(sp.status as SubmissionStatus)
    ? (sp.status as SubmissionStatus)
    : "all";
  const q = sp.q || "";
  const createdFrom = sp.from || undefined;
  const createdTo = sp.to || undefined;

  // El selector de miembros solo tiene sentido si hay más de una persona en
  // la empresa (un owner solo no necesita "ver equipo" — Fase 3 del plan).
  const members = session.company ? await listCompanyMembers(session.company) : [];
  const canSeeTeam = members.length > 1;

  const initialParams = { scope, memberId, status, q, createdFrom, createdTo };

  try {
    const result = await searchSubmissions(session, { ...initialParams, page: 1 });
    return (
      <>
        <NotificationOptInBanner />
        <HistorialView
          initialResult={result}
          initialParams={initialParams}
          members={members}
          canSeeTeam={canSeeTeam}
          error={false}
        />
      </>
    );
  } catch {
    return (
      <>
        <NotificationOptInBanner />
        <HistorialView
          initialResult={null}
          initialParams={initialParams}
          members={members}
          canSeeTeam={canSeeTeam}
          error
        />
      </>
    );
  }
}
