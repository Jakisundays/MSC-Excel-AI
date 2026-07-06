import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PLAN_CATALOG, isPlanKey } from "@/lib/billing";
import type { PlanRecord, SubscriptionStatus } from "@/lib/pocketbase/types";

const STATUS_LABEL: Record<SubscriptionStatus, { label: string; cls: string }> = {
  trialing: { label: "Período de prueba", cls: "bg-muted text-muted-foreground" },
  active: { label: "Activa", cls: "bg-success/10 text-success" },
  past_due: { label: "Pago pendiente", cls: "bg-destructive/10 text-destructive" },
  canceled: { label: "Cancelada", cls: "bg-destructive/10 text-destructive" },
};

/**
 * Solo lectura a propósito: no hay pasarela de pago conectada — el plan de
 * cada empresa lo asigna el equipo de dinardi manualmente en el panel admin
 * de PocketBase (colección `subscriptions`), no desde acá.
 */
export function CompanyBillingView({
  plans,
  currentPlanKey,
  status,
  currentPeriodEnd,
  activeSeats,
  usedThisMonth,
  usageLimit,
  seatLimit,
}: {
  plans: PlanRecord[];
  currentPlanKey: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  activeSeats: number;
  usedThisMonth: number;
  usageLimit: number;
  seatLimit: number | null;
}) {
  const statusInfo = STATUS_LABEL[status] ?? STATUS_LABEL.active;
  const usagePct = usageLimit > 0 ? Math.min(100, (usedThisMonth / usageLimit) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium tracking-tight">Facturación</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Plan, consumo y asientos de tu empresa.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-card rounded-2xl border p-4">
          <div className="text-muted-foreground text-xs">Estado</div>
          <div className="mt-2">
            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", statusInfo.cls)}>
              {statusInfo.label}
            </span>
          </div>
          <div className="text-muted-foreground mt-2 text-xs">
            {status === "trialing" ? "Prueba hasta" : "Renueva"} el{" "}
            {new Date(currentPeriodEnd).toLocaleDateString("es-AR")}
          </div>
        </div>
        <div className="bg-card rounded-2xl border p-4">
          <div className="text-muted-foreground text-xs">Comparaciones (mes)</div>
          <div className="mt-2 font-mono text-lg font-medium tabular-nums">
            {usedThisMonth} / {usageLimit}
          </div>
          <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
            <div
              className={cn("h-full rounded-full", usagePct >= 100 ? "bg-destructive" : "bg-primary")}
              style={{ width: `${usagePct}%` }}
            />
          </div>
        </div>
        <div className="bg-card rounded-2xl border p-4">
          <div className="text-muted-foreground text-xs">Asientos activos</div>
          <div className="mt-2 font-mono text-lg font-medium tabular-nums">
            {activeSeats}
            {seatLimit ? ` / ${seatLimit}` : " (ilimitado)"}
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        Para cambiar de plan o renovar tu suscripción, contactá a tu ejecutivo de cuenta.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          if (!isPlanKey(plan.key)) return null;
          const key = plan.key;
          const copy = PLAN_CATALOG[key];
          const isCurrent = key === currentPlanKey;
          return (
            <div
              key={plan.id}
              className={cn(
                "bg-card flex flex-col rounded-2xl border p-5",
                isCurrent && "ring-primary ring-2",
              )}
            >
              {isCurrent && (
                <Badge variant="secondary" className="mb-2 w-fit">
                  Tu plan actual
                </Badge>
              )}
              <div className="text-primary text-xs font-medium tracking-wide uppercase">
                {copy.name}
              </div>
              <div className="mt-2 font-mono text-2xl font-medium">{copy.priceLabel}</div>
              <div className="text-muted-foreground text-xs">/ mes</div>
              <ul className="my-4 flex flex-col gap-2 text-sm">
                <li className="flex gap-2">
                  <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                  Hasta {plan.max_comparisons_month} comparaciones/mes
                </li>
                <li className="flex gap-2">
                  <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                  {plan.max_seats ? `Hasta ${plan.max_seats} usuarios` : "Usuarios ilimitados"}
                </li>
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
