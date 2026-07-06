import { NextRequest, NextResponse } from "next/server";

import { getServerPb } from "@/lib/pocketbase/server";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { requireCompanyActor } from "@/lib/auth";
import { listCompanyMembers } from "@/lib/company";
import type { CompanyMemberRecord } from "@/lib/pocketbase/types";

/** Equipo de la empresa del actor. Lectura disponible para cualquier miembro activo (no solo owner/admin). */
export async function GET() {
  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const record = pb.authStore.record!;
  const companyId = (record.company as string) || "";
  if (!companyId) return NextResponse.json({ members: [] });

  const members = await listCompanyMembers(companyId);
  return NextResponse.json({ members });
}

/** Cambia rol o estado (activo/suspendido) de un miembro. Solo owner/admin, y nunca sobre un owner. */
export async function PATCH(req: NextRequest) {
  const actor = await requireCompanyActor(["owner", "admin"]);
  if (!actor.ok) return errorFor(actor.error);

  const body = await req.json().catch(() => ({}));
  const memberId = typeof body?.memberId === "string" ? body.memberId : "";
  const role = body?.role;
  const status = body?.status;

  if (!memberId) {
    return NextResponse.json({ error: "Falta memberId." }, { status: 400 });
  }
  if (role !== undefined && role !== "admin" && role !== "member") {
    return NextResponse.json(
      { error: "Rol inválido (solo admin o member; la ownership se transfiere aparte)." },
      { status: 400 },
    );
  }
  if (status !== undefined && status !== "active" && status !== "suspended") {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }

  const admin = await getAdminPb();
  const target = await admin
    .collection("company_members")
    .getOne<CompanyMemberRecord>(memberId)
    .catch(() => null);

  if (!target || target.company !== actor.companyId) {
    return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "No se puede modificar al owner de la empresa." }, { status: 403 });
  }
  if (target.user === actor.userId) {
    return NextResponse.json({ error: "No podés modificar tu propia membresía." }, { status: 403 });
  }

  const patch: Partial<Pick<CompanyMemberRecord, "role" | "status">> = {};
  if (role) patch.role = role;
  if (status) patch.status = status;

  const updated = await admin.collection("company_members").update(memberId, patch);

  if (role) {
    await admin.collection("users").update(target.user, { company_role: role });
  }

  return NextResponse.json({ ok: true, member: updated });
}

/** Remueve un miembro de la empresa (no elimina la cuenta de usuario). Nunca sobre un owner. */
export async function DELETE(req: NextRequest) {
  const actor = await requireCompanyActor(["owner", "admin"]);
  if (!actor.ok) return errorFor(actor.error);

  const memberId = req.nextUrl.searchParams.get("memberId") || "";
  if (!memberId) return NextResponse.json({ error: "Falta memberId." }, { status: 400 });

  const admin = await getAdminPb();
  const target = await admin
    .collection("company_members")
    .getOne<CompanyMemberRecord>(memberId)
    .catch(() => null);

  if (!target || target.company !== actor.companyId) {
    return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "No se puede remover al owner de la empresa." }, { status: 403 });
  }

  await admin.collection("company_members").delete(memberId);
  await admin.collection("users").update(target.user, { company: "", company_role: "" });

  return NextResponse.json({ ok: true });
}

function errorFor(error: "unauthenticated" | "no_company" | "forbidden") {
  if (error === "unauthenticated") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (error === "no_company") return NextResponse.json({ error: "Tu cuenta no pertenece a ninguna empresa." }, { status: 403 });
  return NextResponse.json({ error: "No tenés permisos para esta acción." }, { status: 403 });
}
