import "server-only";

import { getServerPb } from "@/lib/pocketbase/server";
import type { PlanKey } from "@/lib/billing";

/**
 * Persistencia de planes/facturación. Hoy la única implementación real es
 * PocketBase (guarda qué plan eligió cada cuenta) — no hay procesador de
 * pagos conectado todavía. `BillingProvider` existe para que el día que
 * haya uno real (Stripe Billing u otro) el resto de la app (UI, API route)
 * no tenga que cambiar: solo se reemplaza `billingProvider` por una
 * implementación que además dispare el cobro real.
 */
export type SelectPlanResult =
  | { ok: true; plan: PlanKey; selectedAt: string }
  | { ok: false; error: string };

export interface BillingProvider {
  selectPlan(userId: string, plan: PlanKey): Promise<SelectPlanResult>;
}

/**
 * Implementación actual: PocketBase es la única fuente de verdad de qué
 * plan eligió una cuenta. Reemplazar esta clase (sin tocar la UI ni la
 * API route) el día que haya un procesador de pagos real detrás.
 */
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
