"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CompanyOnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function createCompany() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo crear la empresa.");
      toast.success(`Empresa "${name.trim()}" creada — arrancás con 14 días de prueba.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-card mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border p-8 text-center">
      <div className="bg-brand-panel flex size-12 items-center justify-center rounded-xl">
        <Building2 className="text-brand-panel-foreground size-5" aria-hidden />
      </div>
      <div>
        <h2 className="text-lg font-medium">Creá tu empresa</h2>
        <p className="text-muted-foreground mt-1 text-sm text-pretty">
          Un plan cubre a todo tu equipo. Empezás con 14 días de prueba del plan Esencial —
          después elegís el plan que necesites.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Nombre de tu empresa"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createCompany()}
        />
        <Button onClick={createCompany} disabled={submitting || !name.trim()}>
          {submitting && <Loader2 className="animate-spin" />}
          Crear empresa
        </Button>
      </div>
    </div>
  );
}
