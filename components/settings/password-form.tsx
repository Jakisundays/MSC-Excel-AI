"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard } from "@/components/settings/settings-card";

export function PasswordForm() {
  const router = useRouter();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [saving, setSaving] = useState(false);

  const ready = actual.length > 0 && nueva.length >= 8 && nueva === confirmar;

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldPassword: actual,
          password: nueva,
          passwordConfirm: confirmar,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar la contraseña.");

      setActual("");
      setNueva("");
      setConfirmar("");

      if (data.reauthed === false) {
        toast.success("Contraseña actualizada. Iniciá sesión de nuevo.");
        router.push("/login");
        return;
      }
      toast.success("Contraseña actualizada");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard>
      <div className="text-base font-medium">Cambiar contraseña</div>

      <div>
        <Label htmlFor="pw-actual" className="mb-1.5">
          Contraseña actual
        </Label>
        <Input
          id="pw-actual"
          type="password"
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          disabled={saving}
        />
      </div>

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <div>
          <Label htmlFor="pw-nueva" className="mb-1.5">
            Nueva contraseña
          </Label>
          <Input
            id="pw-nueva"
            type="password"
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <Label htmlFor="pw-confirmar" className="mb-1.5">
            Confirmar nueva contraseña
          </Label>
          <Input
            id="pw-confirmar"
            type="password"
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            disabled={saving}
            aria-invalid={confirmar.length > 0 && confirmar !== nueva}
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Mínimo 8 caracteres.
      </p>

      <div className="flex justify-end">
        <Button type="button" onClick={submit} disabled={saving || !ready}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Actualizando…" : "Actualizar contraseña"}
        </Button>
      </div>
    </SettingsCard>
  );
}
