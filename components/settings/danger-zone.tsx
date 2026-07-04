"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SettingsCard } from "@/components/settings/settings-card";

export function DangerZone() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/profile/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar la cuenta.");
      router.push("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setDeleting(false);
    }
  }

  return (
    <SettingsCard>
      <div className="text-destructive text-base font-medium">Zona de peligro</div>

      <div className="flex flex-col items-stretch gap-4 border-b pb-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="text-[15px] font-medium">Desactivar cuenta temporalmente</div>
          <div className="text-muted-foreground mt-0.5 text-[13px]">
            Tu perfil quedará oculto hasta que vuelvas a iniciar sesión.
          </div>
        </div>
        <span className="bg-muted text-muted-foreground shrink-0 self-start rounded-full px-3 py-1 text-xs font-medium sm:self-center">
          Próximamente
        </span>
      </div>

      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="text-[15px] font-medium">Eliminar cuenta permanentemente</div>
          <div className="text-muted-foreground mt-0.5 text-[13px]">
            Se borrará toda tu información, incluido tu historial de solicitudes. Esta
            acción no se puede deshacer.
          </div>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setPassword("");
              setError("");
            }
          }}
        >
          <DialogTrigger asChild>
            <Button variant="destructive" className="shrink-0">
              Eliminar cuenta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TriangleAlert className="text-destructive size-5" aria-hidden />
                Eliminar cuenta permanentemente
              </DialogTitle>
              <DialogDescription>
                Esta acción es irreversible: se borra tu cuenta y todas tus
                solicitudes. Ingresá tu contraseña para confirmar.
              </DialogDescription>
            </DialogHeader>

            <div>
              <Label htmlFor="delete-password" className="mb-1.5">
                Contraseña
              </Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={deleting}
              />
              {error && (
                <p className="text-destructive mt-1.5 text-xs">{error}</p>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={deleting}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleting || !password}
              >
                {deleting && <Loader2 className="animate-spin" />}
                {deleting ? "Eliminando…" : "Eliminar mi cuenta"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SettingsCard>
  );
}
