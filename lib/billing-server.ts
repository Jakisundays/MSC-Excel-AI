import "server-only";

import { getServerPb } from "@/lib/pocketbase/server";
import type { PlanKey } from "@/lib/billing";
import type { PlanRecord } from "@/lib/pocketbase/types";

/**
 * Persistencia de planes/facturación. Hoy la única implementación real es
 * PocketBase (guarda qué plan eligió cada cuenta) — no hay procesador de
 * pagos conectado todavía. `BillingProvider` existe para que el día que
 * haya uno real (Stripe Billing u otro) el resto de la app (UI, API route)
 * no tenga que cambiar: solo se reemplaza `billingProvider` por una
 * implementación que además dispare el cobro real.
 *
 * @deprecated Este provider opera sobre `users.plan` (cuenta individual).
 * Tras la migración B2B (scripts/migrate-to-companies.mjs) la fuente de
 * verdad real para el gate de ejecución es la `subscription` de la empresa.
 * Se conserva sin tocar mientras app/perfil/planes siga siendo una
 * superficie legacy — no lo uses para código nuevo.
 */
export type SelectPlanResult =
  | { ok: true; plan: PlanKey; selectedAt: string }
  | { ok: false; error: string };

export interface BillingProvider {
  selectPlan(userId: string, plan: PlanKey): Promise<SelectPlanResult>;
}

class PocketBaseBillingProvider implements BillingProvider {
  async selectPlan(userId: string, plan: PlanKey): Promise<SelectPlanResult> {
    const selectedAt = new Date().toISOString();
    try {
      const pb = await getServerPb();
      await pb.collection("users").update(userId, {
        plan,
        plan_selected_at: selectedAt,
      });
      return { ok: true, plan, selectedAt };
    } catch {
      return { ok: false, error: "No se pudo actualizar el plan." };
    }
  }
}

export const billingProvider: BillingProvider = new PocketBaseBillingProvider();

// ── Billing a nivel de empresa (B2B) ────────────────────────────

/**
 * Catálogo de planes activo, tal como vive hoy en PocketBase (fuente de
 * verdad de precios/límites). No hay pasarela de pago ni cambio de plan
 * self-service: el plan de cada empresa lo asigna directamente el equipo de
 * dinardi editando la colección `subscriptions` desde el panel admin de
 * PocketBase — esto solo alimenta la vista de solo-lectura de /empresa/billing.
 */
export async function getActivePlans(): Promise<PlanRecord[]> {
  const pb = await getServerPb();
  const res = await pb.collection("plans").getFullList<PlanRecord>({
    filter: "active = true && is_custom = false",
    sort: "price_cents",
  });
  return res;
}
