import { redirect } from "next/navigation";
import { Info } from "lucide-react";

import { getSession } from "@/lib/auth";
import { PlansGrid } from "@/components/plans-grid";
import { PLAN_CATALOG, PLAN_KEYS } from "@/lib/billing";

export const metadata = { title: "Planes" };

export default async function PlanesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div>
        <div className="text-primary mb-2 text-xs font-medium tracking-wide uppercase">
          Planes
        </div>
        <h1 className="text-2xl font-medium tracking-tight sm:text-[28px]">
          Elegí el plan para tu equipo
        </h1>
        <p className="text-muted-foreground mt-3 max-w-[60ch] text-[15px] leading-relaxed text-pretty">
          Cada comparación es un cruce de dos archivos Excel que tu equipo
          procesa con IA. Elegí el plan según cuántas necesitás al mes — si te
          quedás corto, podés cambiar cuando quieras.
        </p>
      </div>

      <PlansGrid currentPlan={session.plan} />

      <div className="bg-muted flex flex-col gap-6 rounded-2xl p-6 sm:flex-row sm:p-8">
        <div className="flex flex-1 gap-4">
          <Info className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <div className="mb-2 text-[17px] font-medium">
              ¿Cómo funciona el excedente?
            </div>
            <p className="text-muted-foreground max-w-[56ch] text-[14.5px] leading-relaxed text-pretty">
              Si tu equipo supera el volumen incluido en su plan, las
              comparaciones adicionales se cobran automáticamente a la tarifa
              de excedente de ese plan — sin interrupciones ni aprobaciones
              manuales. El total se calcula al cierre de cada ciclo mensual.
            </p>
          </div>
        </div>
        <div className="flex flex-none flex-wrap gap-6">
          {PLAN_KEYS.map((key) => {
            const p = PLAN_CATALOG[key];
            return (
              <div key={key}>
                <div className="text-muted-foreground mb-1 text-[11px] tracking-wide uppercase">
                  {p.name}
                </div>
                <div className="font-mono text-[15px] font-medium">
                  {p.overageLabel}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-muted-foreground text-center text-xs">
        Precios en dólares estadounidenses (USD) · facturación mensual.
      </p>
    </div>
  );
}
