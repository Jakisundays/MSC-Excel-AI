import "server-only";

import { getServerPb } from "@/lib/pocketbase/server";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { DEV_PREVIEW, FAKE_USER } from "@/lib/preview";
import type { PlanKey } from "@/lib/billing";
import type {
  CompanyMemberRecord,
  CompanyRecord,
  CompanyRole,
  PlanRecord,
  SubscriptionRecord,
} from "@/lib/pocketbase/types";

export interface Session {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  birthDate: string;
  address: string;
  avatarUrl: string;
  /** "" si la cuenta todavía no eligió ningún plan. @deprecated ver CompanyContext.plan */
  plan: PlanKey | "";
  planSelectedAt: string;
  /** Vacío si la cuenta todavía no pertenece a ninguna empresa (pre-migración/pre-onboarding). */
  company: string;
  companyRole: CompanyRole | "";
  created: string;
  updated: string;
}

/** Sesión actual del request (real desde PocketBase, o fake en dev preview). */
export async function getSession(): Promise<Session | null> {
  if (DEV_PREVIEW) {
    return {
      ...FAKE_USER,
      firstName: "",
      lastName: "",
      phone: "",
      city: "",
      birthDate: "",
      address: "",
      avatarUrl: "",
      plan: "",
      planSelectedAt: "",
      company: "",
      companyRole: "",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
  }

  const pb = await getServerPb();
  if (!pb.authStore.isValid) return null;

  const r = pb.authStore.record!;
  const email = (r.email as string) ?? "";
  const avatar = (r.avatar as string) ?? "";

  return {
    id: r.id,
    email,
    name: (r.name as string) || email.split("@")[0] || "",
    firstName: (r.first_name as string) ?? "",
    lastName: (r.last_name as string) ?? "",
    phone: (r.phone as string) ?? "",
    city: (r.city as string) ?? "",
    birthDate: (r.birth_date as string) ?? "",
    address: (r.address as string) ?? "",
    avatarUrl: avatar ? pb.files.getURL(r, avatar) : "",
    plan: ((r.plan as string) || "") as PlanKey | "",
    planSelectedAt: (r.plan_selected_at as string) ?? "",
    company: (r.company as string) ?? "",
    companyRole: ((r.company_role as string) || "") as CompanyRole | "",
    created: (r.created as string) ?? "",
    updated: (r.updated as string) ?? "",
  };
}

export interface CompanyContext {
  company: CompanyRecord | null;
  membership: CompanyMemberRecord | null;
  role: CompanyRole | null;
  subscription: SubscriptionRecord | null;
  plan: PlanRecord | null;
  /** true si la empresa puede disparar nuevos procesos (suscripción activa/trialing Y la membresía del usuario sigue activa). */
  subscriptionActive: boolean;
}

const EMPTY_CONTEXT: CompanyContext = {
  company: null,
  membership: null,
  role: null,
  subscription: null,
  plan: null,
  subscriptionActive: false,
};

/**
 * Resuelve empresa, membresía, suscripción y plan del usuario autenticado.
 * Usa el cliente admin (no el del usuario) porque companies/company_members
 * filtran por `@request.auth.company`, y acá es donde ese campo se resuelve
 * por primera vez en el request — evita una dependencia circular con la
 * propia regla que protege esas colecciones.
 *
 * Dos llamadas explícitas (no `expand` anidado de 2 niveles): un expand de
 * subscription->plan encadenado es más frágil de lo necesario acá y el costo
 * de una llamada extra es insignificante comparado con el riesgo.
 */
export async function getActiveCompanyContext(
  userId: string,
  companyId: string,
): Promise<CompanyContext> {
  if (!companyId) return EMPTY_CONTEXT;

  const pb = await getAdminPb();

  const company = await pb
    .collection("companies")
    .getOne<CompanyRecord>(companyId)
    .catch(() => null);
  if (!company) return EMPTY_CONTEXT;

  const membership = await pb
    .collection("company_members")
    .getFirstListItem<CompanyMemberRecord>(
      pb.filter("company = {:company} && user = {:user}", { company: companyId, user: userId }),
    )
    .catch(() => null);

  const subscription = await pb
    .collection("subscriptions")
    .getFirstListItem<SubscriptionRecord>(pb.filter("company = {:company}", { company: companyId }))
    .catch(() => null);

  const plan = subscription
    ? await pb
        .collection("plans")
        .getOne<PlanRecord>(subscription.plan)
        .catch(() => null)
    : null;

  const membershipActive = membership?.status === "active";
  const subscriptionLive =
    subscription?.status === "active" || subscription?.status === "trialing";

  return {
    company,
    membership,
    role: membership?.role ?? null,
    subscription,
    plan,
    subscriptionActive: membershipActive && subscriptionLive,
  };
}

export type CompanyActorError = "unauthenticated" | "no_company" | "forbidden";

export type CompanyActorResult =
  | { ok: true; userId: string; companyId: string; role: CompanyRole }
  | { ok: false; error: CompanyActorError };

/**
 * Resuelve el actor autenticado y su rol en su propia empresa, para las
 * route handlers de gestión (invitar, cambiar rol, billing). No usar para
 * el gate de ejecución de procesos (ver evaluateSubscriptionGate en
 * app/api/upload-ticket/route.ts, que además valida suscripción/cuota).
 */
export async function requireCompanyActor(
  minRole: CompanyRole[],
): Promise<CompanyActorResult> {
  const pb = await getServerPb();
  if (!pb.authStore.isValid) return { ok: false, error: "unauthenticated" };

  const record = pb.authStore.record!;
  const companyId = (record.company as string) || "";
  if (!companyId) return { ok: false, error: "no_company" };

  const role = (record.company_role as CompanyRole) || null;
  if (!role || !minRole.includes(role)) return { ok: false, error: "forbidden" };

  return { ok: true, userId: record.id, companyId, role };
}
