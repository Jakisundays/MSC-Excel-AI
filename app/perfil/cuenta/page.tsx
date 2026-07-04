import { getSession } from "@/lib/auth";
import { SettingsCard, SettingsPageHeader } from "@/components/settings/settings-card";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Cuenta" };

export default async function CuentaPage() {
  const session = await getSession();
  if (!session) return null;

  const rows = [
    { label: "ID de cuenta", value: session.id },
    { label: "Cuenta desde", value: formatDateTime(session.created) },
    { label: "Última actualización", value: formatDateTime(session.updated) },
  ];

  return (
    <>
      <SettingsPageHeader
        title="Cuenta"
        subtitle="Datos de tu cuenta en MSC Excel AI."
      />
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
