import { NextRequest, NextResponse } from "next/server";

import {
  getServerPb,
  PB_COOKIE,
  serializeAuth,
  authCookieOptions,
} from "@/lib/pocketbase/server";
import { getAdminPb } from "@/lib/pocketbase/admin";
import type { InvitationRecord } from "@/lib/pocketbase/types";

/**
 * Acepta una invitación pendiente. Requiere sesión ya iniciada (el usuario
 * hace login/signup normal antes de llegar acá — ver /invitaciones/aceptar).
 * `users.company` es singular por diseño (nunca pertenencia simultánea a 2
 * empresas): si la cuenta ya tenía una "empresa personal" propia (Owner de
 * 1 asiento, del backfill de migración o de un registro previo), esa
 * empresa pasa a `status: archived` — decisión de producto explícita, no se
 * borra nada, solo deja de estar activa.
 */
export async function POST(req: NextRequest) {
  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "Falta el token de invitación." }, { status: 400 });

  const record = pb.authStore.record!;
  const admin = await getAdminPb();

  const invitation = await admin
    .collection("invitations")
    .getFirstListItem<InvitationRecord>(admin.filter("token = {:token}", { token }))
    .catch(() => null);

  if (!invitation || invitation.status !== "pending") {
    return NextResponse.json({ error: "La invitación no existe o ya no está disponible." }, { status: 404 });
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    await admin.collection("invitations").update(invitation.id, { status: "expired" });
    return NextResponse.json({ error: "La invitación expiró. Pedí que te envíen una nueva." }, { status: 410 });
  }
  if (invitation.email.toLowerCase() !== ((record.email as string) || "").toLowerCase()) {
    return NextResponse.json(
      { error: "Esta invitación es para otra dirección de email." },
      { status: 403 },
    );
  }

  const previousCompanyId = (record.company as string) || "";
  if (previousCompanyId && previousCompanyId !== invitation.company) {
    await admin.collection("companies").update(previousCompanyId, { status: "archived" }).catch(() => {});
  }

  await admin.collection("company_members").create({
    company: invitation.company,
    user: record.id,
    role: invitation.role,
    status: "active",
    invited_by: invitation.invited_by,
  });

  await admin.collection("users").update(record.id, {
    company: invitation.company,
    company_role: invitation.role,
  });

  await admin.collection("invitations").update(invitation.id, { status: "accepted" });

  const updated = await pb.collection("users").getOne(record.id);
  pb.authStore.save(pb.authStore.token, updated);

  const res = NextResponse.json({ ok: true, companyId: invitation.company });
  res.cookies.set(PB_COOKIE, serializeAuth(pb), authCookieOptions);
  return res;
}
