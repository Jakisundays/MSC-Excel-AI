import { SettingsPageHeader } from "@/components/settings/settings-card";
import { NotificationsSettings } from "@/components/settings/notifications-settings";

export const metadata = { title: "Notificaciones" };

export default function NotificacionesPage() {
  return (
    <>
      <SettingsPageHeader
        title="Notificaciones"
        subtitle="Elegí cómo te avisamos cuando tu solicitud esté lista."
      />
      <NotificationsSettings />
    </>
  );
}
