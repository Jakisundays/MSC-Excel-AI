import { ShieldCheck } from "lucide-react";

import { SettingsCard, SettingsPageHeader } from "@/components/settings/settings-card";
import { PasswordForm } from "@/components/settings/password-form";

export const metadata = { title: "Seguridad" };

export default function SeguridadPage() {
  return (
    <>
      <SettingsPageHeader
        title="Seguridad"
        subtitle="Contraseña y verificación en dos pasos."
      />
      <PasswordForm />

      <SettingsCard className="flex-row items-center gap-4">
        <div className="bg-muted text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
          <ShieldCheck className="size-5" aria-hidden />
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-medium">Verificación en dos pasos</div>
          <div className="text-muted-foreground mt-0.5 text-[13px]">
            Un código adicional al iniciar sesión, para más protección.
          </div>
        </div>
        <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-3 py-1 text-xs font-medium">
          Próximamente
        </span>
      </SettingsCard>
    </>
  );
}
