"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PLAN_CATALOG, PLAN_KEYS, RECOMMENDED_PLAN, type PlanKey } from "@/lib/billing";

/**
 * Mide el ancho real del contenedor (no el viewport): esta grilla vive
 * dentro de la columna de Configuración, cuyo ancho disponible depende del
 * sidebar/breakpoint — medir el propio contenedor es más robusto que
 * adivinar breakpoints de viewport.
 */
function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

export function PlansGrid({
  currentPlan,
}: {
  currentPlan: PlanKey | "";
}) {
  const router = useRouter();
  const { ref, width } = useContainerWidth<HTMLDivElement>();

  const [plan, setPlan] = useState<PlanKey | "">(currentPlan);
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);

  useEffect(() => {
    setPlan(currentPlan);
  }, [currentPlan]);

  const stacked = width > 0 && width < 820;
  const isSubmitting = pendingPlan !== null;

  async function selectPlan(key: PlanKey) {
    if (key === plan || isSubmitting) return;
    const target = PLAN_CATALOG[key];
    setPendingPlan(key);
    try {
      const res = await fetch("/api/billing/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar el plan.");

      setPlan(key);
      toast.success(
        `Ahora estás en el plan ${target.name}. Te enviamos la confirmación por correo.`,
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setPendingPlan(null);
    }
  }

  return (
    <div
      ref={ref}
      role="list"
      aria-label="Planes disponibles"
      className={cn(
        "grid items-stretch gap-4 sm:gap-6",
        stacked ? "grid-cols-1" : "grid-cols-3",
      )}
    >
      {PLAN_KEYS.map((key) => {
        const p = PLAN_CATALOG[key];
        const isCurrent = plan === key;
        const isFeatured = !isCurrent && RECOMMENDED_PLAN === key;
        const isPending = pendingPlan === key;

        const ctaLabel = isCurrent
          ? "Plan actual"
          : plan
            ? `Cambiar a ${p.name}`
            : `Elegir ${p.name}`;

        return (
          <div
            key={key}
            role="listitem"
            aria-label={`Plan ${p.name}${isCurrent ? " (plan actual)" : ""}`}
            className={cn(
              "relative flex flex-col rounded-2xl p-6 transition-[box-shadow,transform] duration-200 sm:p-8",
              isFeatured
                ? "bg-brand-panel text-brand-panel-foreground shadow-[0_24px_60px_-20px_rgba(16,39,26,.45)]"
                : "bg-card border hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]",
            )}
          >
            <div className="mb-0.5 min-h-[26px]">
              {isCurrent && (
                <Badge variant="secondary" className="h-6 rounded-full px-2.5">
                  Tu plan actual
                </Badge>
              )}
              {isFeatured && (
                <Badge className="h-6 rounded-full bg-success px-2.5 text-success-foreground">
                  Recomendado
                </Badge>
              )}
            </div>

            <div
              className={cn(
                "text-[13.5px] font-medium tracking-wide uppercase",
                isFeatured ? "text-success" : "text-primary",
              )}
            >
              {p.name}
            </div>

            <div className="mt-3.5 mb-1 flex items-baseline gap-1.5">
              <span className="font-mono text-[28px] font-medium tracking-tight">
                {p.priceLabel}
              </span>
              <span
                className={cn(
                  "text-[13px]",
                  isFeatured ? "text-brand-panel-foreground/60" : "text-muted-foreground",
                )}
              >
                / mes
              </span>
            </div>

            <div
              className={cn(
                "my-4 h-px",
                isFeatured ? "bg-brand-panel-foreground/15" : "bg-border",
              )}
            />

            <div className="mb-2.5 flex items-start gap-2.5">
              <Check
                className={cn(
                  "mt-0.5 size-[18px] shrink-0",
                  isFeatured ? "text-success" : "text-primary",
                )}
                aria-hidden
              />
              <span className="text-[15px] font-medium">{p.volumeLabel}</span>
            </div>
            <div
              className={cn(
                "mb-5 pl-[26px] text-[13px]",
                isFeatured ? "text-brand-panel-foreground/60" : "text-muted-foreground",
              )}
            >
              Excedente: {p.overageLabel} por comparación adicional
            </div>

            <div
              className={cn(
                "mb-5 h-px",
                isFeatured ? "bg-brand-panel-foreground/15" : "bg-border",
              )}
            />

            <ul className="mb-6 flex flex-1 flex-col gap-3">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm leading-tight">
                  <Check
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      isFeatured ? "text-success" : "text-primary",
                    )}
                    aria-hidden
                  />
                  {f}
                </li>
              ))}
            </ul>

            <Button
              type="button"
              size="lg"
              variant={isCurrent ? "outline" : "default"}
              disabled={isCurrent || isSubmitting}
              onClick={() => selectPlan(key)}
              className="mt-auto h-12 w-full rounded-full text-[15px]"
              aria-label={`${ctaLabel} — ${p.name}, ${p.priceLabel} por mes`}
            >
              {isPending && <Loader2 className="animate-spin" aria-hidden />}
              {ctaLabel}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
