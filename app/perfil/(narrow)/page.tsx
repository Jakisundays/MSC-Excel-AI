import { getSession } from "@/lib/auth";
import { SettingsPageHeader } from "@/components/settings/settings-card";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata = { title: "Perfil" };

export default async function PerfilPage() {
  const session = await getSession();
  if (!session) return null;

  return (
    <>
      <SettingsPageHeader
        title="Perfil"
        subtitle="Gestioná tu información personal y cómo te vemos en tu cuenta."
      />
      <ProfileForm session={session} />
    </>
  );
}
