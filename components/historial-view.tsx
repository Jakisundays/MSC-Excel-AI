"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Search, SearchX, TriangleAlert } from "lucide-react";

import { Input } from "@/components/ui/input";
import { SubmissionsTable } from "@/components/submissions-table";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import type { SubmissionRecord, SubmissionStatus } from "@/lib/pocketbase/types";

type FilterKey = "all" | SubmissionStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Registradas" },
  { key: "processing", label: "En revisión" },
  { key: "completed", label: "Completadas" },
  { key: "failed", label: "Con error" },
];

export function HistorialView({
  items,
  error,
}: {
  items: SubmissionRecord[];
  error: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FilterKey>("all");
  const router = useRouter();

  const hasActiveRows = useMemo(
    () => items.some((s) => s.status === "pending" || s.status === "processing"),
    [items],
  );

  useEffect(() => {
    if (!hasActiveRows) return;
    const interval = setInterval(() => router.refresh(), 25_000);
    return () => clearInterval(interval);
  }, [hasActiveRows, router]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: items.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };
    for (const s of items) c[s.status]++;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((s) => {
      const matchStatus = status === "all" || s.status === status;
      const matchQuery =
        q === "" ||
        `${s.file_a_name} ${s.file_b_name}`.toLowerCase().includes(q);
      return matchStatus && matchQuery;
    });
  }, [items, query, status]);

  if (error) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="No se pudo cargar el historial"
        description="Verificá que la colección submissions exista en PocketBase y que la sesión sea válida."
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Todavía no enviaste solicitudes"
        description="Cuando envíes archivos a procesamiento, vas a verlos acá con su estado."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por archivo"
            aria-label="Buscar por archivo"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = status === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatus(f.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "font-mono text-[10.5px] tabular-nums",
                    active ? "opacity-80" : "text-muted-foreground/80",
                  )}
                >
                  {counts[f.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Sin resultados"
          description="No hay solicitudes que coincidan con la búsqueda o el filtro."
        />
      ) : (
        <SubmissionsTable items={filtered} />
      )}
    </div>
  );
}
