import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { getAdminPb } from "@/lib/pocketbase/admin";
import { requireCompanyActor } from "@/lib/auth";
import { sendInvitationEmail } from "@/lib/company";
import type { InvitationRecord } from "@/lib/pocketbase/types";

const INVITATION_TTL_DAYS = 7;

/** Reenvía una invitación pendiente: regenera token + expiración sobre la misma fila (no duplica). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCompanyActor(["owner", "admin"]);
  if (!actor.ok) return errorFor(actor.error);

  const { id } = await params;
  const admin = await getAdminPb();
  const invitation = await admin
    .collection("invitations")
    .getOne<InvitationRecord>(id)
    .catch(() => null);

  if (!invitation || invitation.company !== actor.companyId) {
    return NextResponse.json({ error: "Invitación no encontrada." }, { status: 404 });
  }
  if (invitation.status !== "pending") {
    return NextResponse.json({ error: "Solo se puede reenviar una invitación pendiente." }, { status: 409 });
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const updated = await admin.collection("invitations").update(id, {
    token,
    expires_at: expiresAt.toISOString(),
  });

  const sent = await sendInvitationEmail(actor.companyId, actor.userId, {
    email: invitation.email,
    token,
  });

  return NextResponse.json({ ok: true, invitation: updated, emailSent: sent });
}

/** Revoca una invitación pendiente. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCompanyActor(["owner", "admin"]);
  if (!actor.ok) return errorFor(actor.error);

  const { id } = await params;
  const admin = await getAdminPb();
  const invitation = await admin
    .collection("invitations")
    .getOne<InvitationRecord>(id)
    .catch(() => null);

  if (!invitation || invitation.company !== actor.companyId) {
    return NextResponse.json({ error: "Invitación no encontrada." }, { status: 404 });
  }

  await admin.collection("invitations").update(id, { status: "revoked" });
  return NextResponse.json({ ok: true });
}

function errorFor(error: "unauthenticated" | "no_company" | "forbidden") {
  if (error === "unauthenticated") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (error === "no_company") return NextResponse.json({ error: "Tu cuenta no pertenece a ninguna empresa." }, { status: 403 });
  return NextResponse.json({ error: "No tenés permisos para esta acción." }, { status: 403 });
}
