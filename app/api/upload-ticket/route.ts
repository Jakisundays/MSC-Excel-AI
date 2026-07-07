import { NextResponse } from "next/server";
import {
  getServerPb,
  PB_COOKIE,
  serializeAuth,
  authCookieOptions,
} from "@/lib/pocketbase/server";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { signUploadTicket } from "@/lib/ticket";
import { env } from "@/lib/env";
import { DEV_PREVIEW, FAKE_USER } from "@/lib/preview";
import { getActiveCompanyContext } from "@/lib/auth";
import { countCompanySubmissionsThisMonth } from "@/lib/submissions";

/**
 * Cuánto vive el token de impersonación que autoriza la subida directa de
 * los archivos ORIGINALES navegador -> PocketBase (ver
 * docs/original-files-storage-plan.md, Opción A). Deliberadamente corto:
 * muy por debajo de los 5 días del authToken de sesión normal, para que
 * exponerlo un instante al JS del cliente no equivalga a robar la sesión.
 * Solo necesita sobrevivir el tiempo de subir dos archivos, nunca se
 * reutiliza más allá de ese request.
 */
const ORIGINAL_UPLOAD_TOKEN_TTL_SECONDS = 120;

/**
 * Emite un upload-ticket de corta duración tras validar la sesión
 * (authRefresh = validación autoritativa contra PocketBase) y, a partir de
 * acá, también el estado de la empresa — este es el chokepoint real del
 * gate B2B (ver docs/b2b-multi-tenant-plan.md, Sección 5, punto 1): todo lo
 * demás (reglas de PocketBase, server components) es defensa en
 * profundidad, no el enforcement principal.
 *
 * SUBSCRIPTION_GATE_MODE (env.ts) controla el rollout:
 * - "off": no valida nada de empresa (estado pre-migración).
 * - "log": valida y deja pasar igual, solo deja rastro en logs — default
 *   seguro mientras se corre scripts/migrate-to-companies.mjs y se
 *   confirma que ninguna cuenta real quede bloqueada por error.
 * - "enforce": bloquea de verdad. No activar antes de correr el backfill.
 *
 * Payload chico (sin archivos) → seguro bajo el límite de Vercel. Además
 * del ticket del orchestrator, emite un token de impersonación de
 * PocketBase (`pbUploadToken`) para que el navegador suba los archivos
 * ORIGINALES directo a PocketBase, mismo motivo (bypassear el límite de
 * ~4.5MB de Vercel) que ya aplica al ticket del orchestrator.
 */
export async function POST() {
  if (DEV_PREVIEW) {
    const ticket = await signUploadTicket({
      sub: FAKE_USER.id,
      email: FAKE_USER.email,
    });
    return NextResponse.json({
      ticket,
      orchestratorUrl: env.ORCHESTRATOR_URL,
      pbUploadToken: null,
      pocketbaseUrl: null,
    });
  }

  const pb = await getServerPb();

  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    await pb.collection("users").authRefresh();
  } catch {
    return NextResponse.json(
      { error: "Sesión expirada" },
      { status: 401 },
    );
  }

  const record = pb.authStore.record!;

  if (env.SUBSCRIPTION_GATE_MODE !== "off") {
    const gate = await evaluateSubscriptionGate(record.id, (record.company as string) || "");
    if (!gate.ok) {
      if (env.SUBSCRIPTION_GATE_MODE === "enforce") {
        return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
      }
      console.warn(
        `[subscription-gate:log] bloquearía a ${record.email} (${gate.code}): ${gate.error}`,
      );
    }
  }

  const ticket = await signUploadTicket({
    sub: record.id,
    email: record.email as string,
    companyId: (record.company as string) || undefined,
  });

  // Best-effort: guardar el original es una mejora, no el flujo principal
  // (el envío al orchestrator ya se resolvió arriba). Si PocketBase no
  // puede emitir el token de impersonación (instancia caída, admin creds
  // inválidas, etc.), no rompemos el ticket completo -- el cliente
  // simplemente se queda sin poder guardar el original esta vez.
  let pbUploadToken: string | null = null;
  try {
    const adminPb = await getAdminPb();
    const impersonated = await adminPb
      .collection("users")
      .impersonate(record.id, ORIGINAL_UPLOAD_TOKEN_TTL_SECONDS);
    pbUploadToken = impersonated.authStore.token;
  } catch (err) {
    console.warn("[upload-ticket] no se pudo emitir el token de impersonación:", err);
  }

  const res = NextResponse.json({
    ticket,
    orchestratorUrl: env.ORCHESTRATOR_URL,
    pbUploadToken,
    pocketbaseUrl: pbUploadToken ? env.POCKETBASE_URL : null,
  });
  // re-persistir la cookie con el token refrescado
  res.cookies.set(PB_COOKIE, serializeAuth(pb), authCookieOptions);
  return res;
}

type GateResult =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

async function evaluateSubscriptionGate(userId: string, companyId: string): Promise<GateResult> {
  if (!companyId) {
    return {
      ok: false,
      status: 403,
      code: "NO_COMPANY",
      error: "Tu cuenta no pertenece a ninguna empresa.",
    };
  }

  const ctx = await getActiveCompanyContext(userId, companyId);

  if (!ctx.membership || ctx.membership.status !== "active") {
    return {
      ok: false,
      status: 403,
      code: "MEMBERSHIP_SUSPENDED",
      error: "Tu acceso a la empresa fue suspendido.",
    };
  }

  if (!ctx.subscriptionActive || !ctx.subscription || !ctx.plan) {
    return {
      ok: false,
      status: 402,
      code: "SUBSCRIPTION_INACTIVE",
      error: "La suscripción de tu empresa está vencida. Contactá a tu administrador.",
    };
  }

  // "||" no "??": un number sin setear en PocketBase es 0, no null/undefined.
  const limit = ctx.subscription.usage_limit_override || ctx.plan.max_comparisons_month;
  const usedThisMonth = await countCompanySubmissionsThisMonth(ctx.company!.id);
  if (usedThisMonth >= limit) {
    return {
      ok: false,
      status: 402,
      code: "USAGE_LIMIT_REACHED",
      error: "Tu empresa alcanzó el límite mensual de comparaciones de su plan.",
    };
  }

  return { ok: true };
}
