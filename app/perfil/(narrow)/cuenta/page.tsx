import Link from "next/link";

import { getSession } from "@/lib/auth";
import { SettingsCard, SettingsPageHeader } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { PLAN_CATALOG } from "@/lib/billing";

export const metadata = { title: "Cuenta" };

export default async function CuentaPage() {
  const session = await getSession();
  if (!session) return null;

  const rows = [
    { label: "ID de cuenta", value: session.id },
    { label: "Cuenta desde", value: formatDateTime(session.created) },
    { label: "Última actualización", value: formatDateTime(session.updated) },
  ];

  const plan = session.plan ? PLAN_CATALOG[session.plan] : null;

  return (
    <>
      <SettingsPageHeader
        title="Cuenta"
        subtitle="Tu plan, datos de cuenta y preferencias."
      />

      <SettingsCard>
        <div className="flex flex-col gap-1">
          <div className="text-base font-medium">Plan</div>
          {plan ? (
            <>
              <div className="font-mono text-2xl font-medium tracking-tight">
                {plan.priceLabel}
                <span className="text-muted-foreground ml-1.5 text-sm font-sans font-normal">
                  / mes · {plan.name}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-[13px]">
                Plan elegido el {formatDateTime(session.planSelectedAt)}.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground mt-1 max-w-[52ch] text-sm">
              Todavía no tenés un plan contratado. Elegí uno según el volumen
              mensual de comparaciones que necesita tu equipo.
            </p>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-2.5 pt-1 sm:flex-row sm:items-center">
          <Button asChild>
            <Link href="/perfil/planes">
              {plan ? "Cambiar de plan" : "Elegir plan"}
            </Link>
          </Button>
          {plan && (
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" disabled>
                Ver historial de facturación
              </Button>
              <Badge variant="secondary" className="rounded-full">
                Próximamente
              </Badge>
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard className="gap-0">
        <div className="mb-2 text-base font-medium">Datos de la cuenta</div>
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={
              "flex items-center justify-between gap-4 py-3.5" +
              (i < rows.length - 1 ? " border-b" : "")
            }
          >
            <span className="text-muted-foreground text-sm">{r.label}</span>
            <span className="font-mono text-sm">{r.value}</span>
          </div>
        ))}
      </SettingsCard>
    </>
  );
}
