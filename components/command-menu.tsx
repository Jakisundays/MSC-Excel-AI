"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  History,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Search,
  Sun,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  async function logout() {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground gap-2 font-normal"
        aria-label="Abrir buscador de comandos"
      >
        <Search />
        <span className="hidden lg:inline">Buscar</span>
        <kbd className="bg-muted text-muted-foreground pointer-events-none ml-1 hidden h-5 items-center gap-0.5 rounded border px-1.5 font-mono text-[10px] font-medium select-none lg:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Comandos"
        description="Navegá o ejecutá una acción."
      >
        <CommandInput placeholder="Buscar o ejecutar…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="Navegación">
            <CommandItem onSelect={() => run(() => router.push("/dashboard"))}>
              <LayoutDashboard />
              Resumen
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => router.push("/nueva-solicitud"))}
            >
              <Upload />
              Nueva solicitud
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/historial"))}>
              <History />
              Historial
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Tema">
            <CommandItem onSelect={() => run(() => setTheme("light"))}>
              <Sun />
              Claro
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("dark"))}>
              <Moon />
              Oscuro
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("system"))}>
              <Monitor />
              Sistema
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Cuenta">
            <CommandItem onSelect={logout}>
              <LogOut />
              Cerrar sesión
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
