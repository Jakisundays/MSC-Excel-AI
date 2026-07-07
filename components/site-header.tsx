"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { CommandMenu } from "@/components/command-menu";
import { NotificationsBell } from "@/components/notifications-bell";

const TITLES: Record<string, string> = {
  "/dashboard": "Resumen",
  "/nueva-solicitud": "Nueva solicitud",
  "/historial": "Historial",
};

export function SiteHeader() {
  const pathname = usePathname();
  const title =
    TITLES[pathname] ??
    (pathname.startsWith("/historial/") ? "Detalle de solicitud" : "MSC Excel AI");
  const showNewRequest = pathname !== "/nueva-solicitud";

  return (
    <header className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1.5" />
      <Separator
        orientation="vertical"
        className="mr-1 data-[orientation=vertical]:h-4"
      />
      <h1 className="text-sm font-medium">{title}</h1>

      <div className="ml-auto flex items-center gap-1.5">
        <CommandMenu />
        <NotificationsBell />
        <ModeToggle />
        {showNewRequest && (
          <Button asChild size="sm">
            <Link href="/nueva-solicitud">
              <Plus />
              <span className="hidden sm:inline">Nueva solicitud</span>
              <span className="sm:hidden">Nueva</span>
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}
