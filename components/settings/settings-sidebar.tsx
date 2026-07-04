"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogoMark } from "@/components/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { SETTINGS_NAV } from "./nav-items";
import { cn, initials } from "@/lib/utils";

export function SettingsSidebar({
  name,
  email,
  avatarUrl,
}: {
  name: string;
  email: string;
  avatarUrl: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="bg-sidebar sticky top-0 hidden h-screen w-20 shrink-0 flex-col gap-6 overflow-y-auto border-r px-3 py-6 md:flex lg:w-72 lg:gap-7 lg:px-5">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-1 lg:px-2">
        <div className="bg-brand-panel flex size-8 shrink-0 items-center justify-center rounded-full">
          <LogoMark />
        </div>
        <span className="hidden text-[15px] font-medium tracking-tight lg:inline">
          Mi cuenta
        </span>
      </Link>

      <div className="hidden flex-col items-center gap-3 rounded-2xl border p-5 text-center lg:flex">
        <Avatar className="size-18">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
          <AvatarFallback className="text-xl">{initials(name, email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {name || email.split("@")[0]}
          </div>
          <div className="text-muted-foreground truncate text-xs">{email}</div>
        </div>
      </div>
      <div className="flex justify-center lg:hidden">
        <Avatar className="size-11">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
          <AvatarFallback>{initials(name, email)}</AvatarFallback>
        </Avatar>
      </div>

      <nav className="flex flex-col gap-1">
        {SETTINGS_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-center text-[10px] font-medium transition-colors",
                "lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-left lg:text-sm",
                active
                  ? "bg-card text-primary ring-foreground/5 shadow-sm ring-1"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-[18px] shrink-0" aria-hidden />
              <span className="leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-4">
        <div className="bg-border h-px" />

        <div className="hidden items-center justify-between lg:flex">
          <span className="text-muted-foreground text-xs font-medium">
            Apariencia
          </span>
          <ModeToggle />
        </div>
        <div className="flex justify-center lg:hidden">
          <ModeToggle />
        </div>

        <Link
          href="/dashboard"
          className="hover:bg-card flex h-11 items-center justify-center gap-2 rounded-full border text-sm font-medium transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="hidden lg:inline">Volver al inicio</span>
        </Link>

        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="text-muted-foreground hover:text-destructive flex h-10 w-full items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden lg:inline">Cerrar sesión</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
