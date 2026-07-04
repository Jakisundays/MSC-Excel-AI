"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";

import { ModeToggle } from "@/components/mode-toggle";
import { SETTINGS_NAV } from "./nav-items";
import { cn } from "@/lib/utils";

export function SettingsMobileNav() {
  const pathname = usePathname();
  const active = SETTINGS_NAV.find((i) => i.href === pathname);

  return (
    <div className="bg-background/95 sticky top-0 z-10 border-b backdrop-blur md:hidden">
      <div className="flex items-center gap-1 px-3 py-2.5">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-full"
          aria-label="Volver al inicio"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <span className="flex-1 truncate text-[15px] font-medium">
          {active?.label ?? "Mi cuenta"}
        </span>
        <ModeToggle />
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            aria-label="Cerrar sesión"
            className="text-muted-foreground hover:text-destructive flex size-9 shrink-0 items-center justify-center rounded-full"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </form>
      </div>
      <div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SETTINGS_NAV.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "bg-card text-muted-foreground",
              )}
            >
              <item.icon className="size-3.5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
