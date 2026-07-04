import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";
import { SettingsMobileNav } from "@/components/settings/settings-mobile-nav";

export default async function PerfilLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <SettingsSidebar
        name={session.name}
        email={session.email}
        avatarUrl={session.avatarUrl}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <SettingsMobileNav />
        <div className="px-4 py-6 sm:px-6 md:px-8 md:py-10 lg:px-16 lg:py-14">
          {children}
        </div>
      </div>
    </div>
  );
}
