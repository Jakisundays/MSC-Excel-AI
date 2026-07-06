import { NextRequest, NextResponse } from "next/server";

import {
  getServerPb,
  PB_COOKIE,
  serializeAuth,
  authCookieOptions,
} from "@/lib/pocketbase/server";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

const TRIAL_DAYS = 14;

/**
 * Alta de empresa (onboarding). Solo para cuentas que todavía no
 * pertenecen a ninguna — crea companies + company_members(owner) +
 * subscriptions(trialing, plan más barato) atómicamente vía admin client,
 * nunca directo desde el cliente (ver reglas createRule=null en
 * scripts/pb-migrations/001-b2b-schema.mjs).
 */
export async function POST(req: NextRequest) {
  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const record = pb.authStore.record!;
  if (record.company) {
    return NextResponse.json({ error: "Tu cuenta ya pertenece a una empresa." }, { status: 409 });
  }

  if (!checkRateLimit(`companies-create:${record.id}`, 5, 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Esperá un minuto e intentá de nuevo." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) {
    return NextResponse.json({ error: "Ingresá un nombre de empresa válido." }, { status: 400 });
  }

  const admin = await getAdminPb();
  const domain = (record.email as string)?.split("@")[1] || "";
  const slug = `${slugify(name)}-${record.id.slice(0, 6)}`;

  const plan = await admin
    .collection("plans")
    .getFirstListItem(admin.filter('key = "esencial" && active = true'))
    .catch(() => null);
  if (!plan) {
    return NextResponse.json(
      { error: "El catálogo de planes no está disponible todavía." },
      { status: 500 },
    );
  }

  const company = await admin.collection("companies").create({
    name,
    slug,
    email_domain: domain,
    domain_verified: false,
    owner: record.id,
    status: "active",
  });

  await admin.collection("company_members").create({
    company: company.id,
    user: record.id,
    role: "owner",
    status: "active",
  });

  const now = new Date();
  const periodEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const subscription = await admin.collection("subscriptions").create({
    company: company.id,
    plan: plan.id,
    status: "trialing",
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
  });

  await admin.collection("subscription_events").create({
    subscription: subscription.id,
    type: "created",
    to_plan: plan.id,
  });

  await admin.collection("users").update(record.id, {
    company: company.id,
    company_role: "owner",
  });

  // Refresca la sesión del propio actor para que company/company_role
  // queden disponibles en el próximo request sin esperar a un authRefresh.
  const updated = await pb.collection("users").getOne(record.id);
  pb.authStore.save(pb.authStore.token, updated);

  const res = NextResponse.json({ ok: true, company: { id: company.id, name, slug } });
  res.cookies.set(PB_COOKIE, serializeAuth(pb), authCookieOptions);
  return res;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
