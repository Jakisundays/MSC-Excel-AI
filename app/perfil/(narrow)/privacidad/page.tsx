import { Download } from "lucide-react";

import { SettingsCard, SettingsPageHeader } from "@/components/settings/settings-card";
import { DangerZone } from "@/components/settings/danger-zone";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Privacidad" };

export default function PrivacidadPage() {
  return (
    <>
      <SettingsPageHeader
        title="Privacidad y datos"
        subtitle="Controlá tu información y las opciones de tu cuenta."
      />

      <SettingsCard className="flex-col items-stretch gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-4">
          <div className="bg-muted text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
            <Download className="size-5" aria-hidden />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-medium">Descargá tus datos</div>
            <div className="text-muted-foreground mt-0.5 text-[13px]">
              Tu información de perfil y el historial completo de tus solicitudes, en
              un archivo JSON.
            </div>
          </div>
        </div>
        <Button asChild variant="secondary" className="shrink-0">
          <a href="/api/profile/export">Descargar mis datos</a>
        </Button>
      </SettingsCard>

      <DangerZone />
    </>
  );
}
