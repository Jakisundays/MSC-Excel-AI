import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { getAdminPb } from "@/lib/pocketbase/admin";
import { requireCompanyActor } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendInvitationEmail } from "@/lib/company";
import type { InvitationRecord, PlanRecord, SubscriptionRecord } from "@/lib/pocketbase/types";

const INVITATION_TTL_DAYS = 7;

/** Invitaciones pendientes de la empresa del actor (owner/admin). */
export async function GET() {
  const actor = await requireCompanyActor(["owner", "admin"]);
  if (!actor.ok) return errorFor(actor.error);

  const admin = await getAdminPb();
  const invitations = await admin.collection("invitations").getFullList<InvitationRecord>({
    filter: admin.filter('company = {:companyId} && status = "pending"', {
      companyId: actor.companyId,
    }),
    sort: "-created",
  });

  return NextResponse.json({ invitations });
}

/** Invita a un email nuevo con rol admin|member. Valida asientos disponibles contra el plan. */
export async function POST(req: NextRequest) {
  const actor = await requireCompanyActor(["owner", "admin"]);
  if (!actor.ok) return errorFor(actor.error);

  if (!checkRateLimit(`invitations-create:${actor.companyId}`, 20, 60_000)) {
    return NextResponse.json(
      { error: "Demasiadas invitaciones. Esperá un minuto e intentá de nuevo." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body?.role;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Ingresá un email válido." }, { status: 400 });
  }
  if (role !== "admin" && role !== "member") {
    return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
  }

  const admin = await getAdminPb();

  const existingPending = await admin
    .collection("invitations")
    .getFirstListItem(
      admin.filter('company = {:companyId} && email = {:email} && status = "pending"', {
        companyId: actor.companyId,
        email,
      }),
    )
    .catch(() => null);
  if (existingPending) {
    return NextResponse.json(
      { error: "Ya hay una invitación pendiente para ese email." },
      { status: 409 },
    );
  }

  const subscription = await admin
    .collection("subscriptions")
    .getFirstListItem<SubscriptionRecord>(
      admin.filter("company = {:companyId}", { companyId: actor.companyId }),
    )
    .catch(() => null);
  if (!subscription) {
    return NextResponse.json({ error: "Tu empresa no tiene una suscripción activa." }, { status: 402 });
  }
  const plan = await admin.collection("plans").getOne<PlanRecord>(subscription.plan);

  // "||" no "??": un number sin setear en PocketBase es 0, no null/undefined
  // (0 nunca es un override real con intención de "0 asientos comprados").
  const seatLimit = subscription.seats_purchased || plan.max_seats;
  if (seatLimit) {
    const [activeMembers, pendingInvites] = await Promise.all([
      admin.collection("company_members").getList(1, 1, {
        filter: admin.filter('company = {:companyId} && status = "active"', {
          companyId: actor.companyId,
        }),
      }),
      admin.collection("invitations").getList(1, 1, {
        filter: admin.filter('company = {:companyId} && status = "pending"', {
          companyId: actor.companyId,
        }),
      }),
    ]);
    const occupied = activeMembers.totalItems + pendingInvites.totalItems;
    if (occupied >= seatLimit) {
      return NextResponse.json(
        {
          error: `Tu plan (${plan.name}) admite hasta ${seatLimit} usuarios y ya están todos ocupados (activos + invitaciones pendientes). Desactivá a alguien o cambiá de plan.`,
        },
        { status: 409 },
      );
    }
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await admin.collection("invitations").create({
    company: actor.companyId,
    email,
    role,
    token,
    status: "pending",
    invited_by: actor.userId,
    expires_at: expiresAt.toISOString(),
  });

  const sent = await sendInvitationEmail(actor.companyId, actor.userId, { email, token });

  return NextResponse.json({ ok: true, invitation, emailSent: sent });
}

function errorFor(error: "unauthenticated" | "no_company" | "forbidden") {
  if (error === "unauthenticated") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (error === "no_company") return NextResponse.json({ error: "Tu cuenta no pertenece a ninguna empresa." }, { status: 403 });
  return NextResponse.json({ error: "No tenés permisos para esta acción." }, { status: 403 });
}
