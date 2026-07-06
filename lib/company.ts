import "server-only";

import { getAdminPb } from "@/lib/pocketbase/admin";
import { env } from "@/lib/env";
import { invitationEmailHtml, sendMail } from "@/lib/mailer";
import type {
  CompanyMemberRecord,
  CompanyRecord,
  CompanyRole,
  InvitationRecord,
  PlanRecord,
  SubscriptionRecord,
  UserRecord,
} from "@/lib/pocketbase/types";

export interface CompanyMemberView {
  id: string;
  role: CompanyRole;
  status: CompanyMemberRecord["status"];
  createdAt: string;
  user: { id: string; email: string; name: string } | null;
}

/** Equipo completo de una empresa (para el panel de Equipo del dashboard). */
export async function listCompanyMembers(companyId: string): Promise<CompanyMemberView[]> {
  const pb = await getAdminPb();
  const members = await pb.collection("company_members").getFullList<CompanyMemberRecord>({
    filter: pb.filter("company = {:companyId}", { companyId }),
    expand: "user",
    sort: "-created",
  });

  return members.map((m) => {
    const user = (m as unknown as { expand?: { user?: UserRecord } }).expand?.user;
    return {
      id: m.id,
      role: m.role,
      status: m.status,
      createdAt: m.created,
      user: user ? { id: user.id, email: user.email, name: user.name || "" } : null,
    };
  });
}

/** Envía (o reenvía) el correo de invitación con el link de aceptación vigente. */
export async function sendInvitationEmail(
  companyId: string,
  inviterUserId: string,
  invitation: { email: string; token: string },
): Promise<boolean> {
  const pb = await getAdminPb();
  const [company, inviter] = await Promise.all([
    pb.collection("companies").getOne<CompanyRecord>(companyId),
    pb.collection("users").getOne<UserRecord>(inviterUserId),
  ]);
  const acceptUrl = `${env.APP_URL}/invitaciones/aceptar?token=${encodeURIComponent(invitation.token)}`;
  return sendMail({
    to: invitation.email,
    subject: `${inviter.email} te invitó a ${company.name} en MSC Excel AI`,
    html: invitationEmailHtml({ companyName: company.name, inviterEmail: inviter.email, acceptUrl }),
  });
}

export async function listPendingInvitations(companyId: string): Promise<InvitationRecord[]> {
  const pb = await getAdminPb();
  return pb.collection("invitations").getFullList<InvitationRecord>({
    filter: pb.filter('company = {:companyId} && status = "pending"', { companyId }),
    sort: "-created",
  });
}

export interface CompanyBillingView {
  subscription: SubscriptionRecord;
  plan: PlanRecord;
  activeSeats: number;
  usedThisMonth: number;
}

/** Estado de facturación de la empresa (plan, cupo, asientos usados) para /empresa/billing. */
export async function getCompanyBilling(companyId: string): Promise<CompanyBillingView | null> {
  const pb = await getAdminPb();

  const subscription = await pb
    .collection("subscriptions")
    .getFirstListItem<SubscriptionRecord>(pb.filter("company = {:companyId}", { companyId }))
    .catch(() => null);
  if (!subscription) return null;

  const plan = await pb.collection("plans").getOne<PlanRecord>(subscription.plan);

  const [seats, usage] = await Promise.all([
    pb.collection("company_members").getList(1, 1, {
      filter: pb.filter('company = {:companyId} && status = "active"', { companyId }),
    }),
    pb.collection("submissions").getList(1, 1, {
      filter: pb.filter("company = {:companyId} && created >= {:startOfMonth}", {
        companyId,
        startOfMonth: new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        ).toISOString(),
      }),
    }),
  ]);

  return {
    subscription,
    plan,
    activeSeats: seats.totalItems,
    usedThisMonth: usage.totalItems,
  };
}
