"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Inbox, Loader2, Search, SearchX, TriangleAlert, User, Users } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmissionsTable } from "@/components/submissions-table";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import type { CompanyMemberView } from "@/lib/company";
import type { SubmissionsSearchResult, SubmissionsScope } from "@/lib/submissions";
import type { SubmissionStatus } from "@/lib/pocketbase/types";

type FilterKey = "all" | SubmissionStatus;
type DatePreset = "all" | "today" | "7d" | "month";

const STATUS_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Registradas" },
  { key: "processing", label: "En revisión" },
  { key: "completed", label: "Completadas" },
  { key: "failed", label: "Con error" },
];

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "today", label: "Hoy" },
  { key: "7d", label: "Últimos 7 días" },
  { key: "month", label: "Este mes" },
];

function presetRange(preset: DatePreset): { from?: string; to?: string } {
  const now = new Date();
  if (preset === "today") {
    return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString() };
  }
  if (preset === "7d") {
    return { from: new Date(now.getTime() - 7 * 86_400_000).toISOString() };
  }
  if (preset === "month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
  }
  return {};
}

interface Params {
  scope: SubmissionsScope;
  memberId?: string;
  status: FilterKey;
  q: string;
  createdFrom?: string;
  createdTo?: string;
}

function paramsToSearch(params: Params, page: number): URLSearchParams {
  const sp = new URLSearchParams();
  if (params.scope === "team") sp.set("scope", "team");
  if (params.memberId) sp.set("member", params.memberId);
  if (params.status !== "all") sp.set("status", params.status);
  if (params.q) sp.set("q", params.q);
  if (params.createdFrom) sp.set("from", params.createdFrom);
  if (params.createdTo) sp.set("to", params.createdTo);
  if (page > 1) sp.set("page", String(page));
  return sp;
}

export function HistorialView({
  initialResult,
  initialParams,
  members,
  canSeeTeam = false,
  error,
}: {
  initialResult: SubmissionsSearchResult | null;
  initialParams: Partial<Params>;
  members: CompanyMemberView[];
  canSeeTeam?: boolean;
  error: boolean;
}) {
  const [scope, setScope] = useState<SubmissionsScope>(initialParams.scope ?? "mine");
  const [memberId, setMemberId] = useState<string | undefined>(initialParams.memberId);
  const [status, setStatus] = useState<FilterKey>(initialParams.status ?? "all");
  const [queryInput, setQueryInput] = useState(initialParams.q ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(initialParams.q ?? "");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");

  const [items, setItems] = useState(initialResult?.items ?? []);
  const [page, setPage] = useState(initialResult?.page ?? 1);
  const [totalItems, setTotalItems] = useState(initialResult?.totalItems ?? 0);
  const [hasMore, setHasMore] = useState(initialResult?.hasMore ?? false);
  const [scopeApplied, setScopeApplied] = useState<SubmissionsScope>(
    initialResult?.scopeApplied ?? "mine",
  );
  const [loadError, setLoadError] = useState(error);
  const [isRefetching, setIsRefetching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const isFirstRun = useRef(true);

  const memberStatusById = useMemo(() => {
    const map = new Map<string, CompanyMemberView["status"]>();
    for (const m of members) {
      if (m.user) map.set(m.user.id, m.status);
    }
    return map;
  }, [members]);

  // Debounce de la búsqueda: 350ms sin tipear antes de disparar el fetch.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(queryInput), 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  const currentParams = useMemo<Params>(() => {
    const range = presetRange(datePreset);
    return { scope, memberId, status, q: debouncedQuery, createdFrom: range.from, createdTo: range.to };
  }, [scope, memberId, status, debouncedQuery, datePreset]);

  const fetchPage = useCallback(async (params: Params, targetPage: number, signal?: AbortSignal) => {
    const sp = paramsToSearch(params, targetPage);
    const res = await fetch(`/api/submissions/search?${sp.toString()}`, { signal });
    if (!res.ok) throw new Error("request failed");
    return (await res.json()) as SubmissionsSearchResult;
  }, []);

  // Cualquier cambio de filtro reinicia a página 1 y reemplaza los items
  // (nunca acumula sobre un filtro distinto). La carga inicial ya vino por
  // props desde el server component, así que se salta acá.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRefetching(true);
    setLoadError(false);

    fetchPage(currentParams, 1, controller.signal)
      .then((result) => {
        setItems(result.items);
        setPage(result.page);
        setTotalItems(result.totalItems);
        setHasMore(result.hasMore);
        setScopeApplied(result.scopeApplied);

        const qs = paramsToSearch(currentParams, 1).toString();
        const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
        window.history.replaceState(null, "", url);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setLoadError(true);
      })
      .finally(() => setIsRefetching(false));
  }, [currentParams, fetchPage]);

  // Refresco liviano mientras haya filas activas (pending/processing) — solo
  // en la primera página, para no pelear con "cargar más" acumulado.
  const hasActiveRows = useMemo(
    () => items.some((s) => s.status === "pending" || s.status === "processing"),
    [items],
  );
  useEffect(() => {
    if (!hasActiveRows || page !== 1) return;
    const interval = setInterval(() => {
      fetchPage(currentParams, 1)
        .then((result) => {
          setItems(result.items);
          setTotalItems(result.totalItems);
          setHasMore(result.hasMore);
        })
        .catch(() => {
          /* silencioso: es un refresco en segundo plano, no una acción del usuario */
        });
    }, 25_000);
    return () => clearInterval(interval);
  }, [hasActiveRows, page, currentParams, fetchPage]);

  async function loadMore() {
    setIsLoadingMore(true);
    try {
      const result = await fetchPage(currentParams, page + 1);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...result.items.filter((i) => !seen.has(i.id))];
      });
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }

  if (loadError && items.length === 0) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="No se pudo cargar el historial"
        description="Verificá que la colección submissions exista en PocketBase y que la sesión sea válida."
      />
    );
  }

  const showingTeam = scopeApplied === "team";
  const hasActiveFilters = queryInput !== "" || status !== "all" || datePreset !== "all" || !!memberId;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        {canSeeTeam && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-muted inline-flex rounded-full p-0.5">
              <button
                type="button"
                onClick={() => {
                  setScope("mine");
                  setMemberId(undefined);
                }}
                aria-pressed={scope === "mine"}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  scope === "mine"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <User className="size-3.5" aria-hidden />
                Mis procesos
              </button>
              <button
                type="button"
                onClick={() => setScope("team")}
                aria-pressed={scope === "team"}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  scope === "team"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Users className="size-3.5" aria-hidden />
                Todo el equipo
              </button>
            </div>

            {scope === "team" && (
              <Select
                value={memberId ?? "__all__"}
                onValueChange={(v) => setMemberId(v === "__all__" ? undefined : v)}
              >
                <SelectTrigger className="h-8 w-[220px]">
                  <SelectValue placeholder="Todo el equipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todo el equipo</SelectItem>
                  {members
                    .filter((m) => m.user)
                    .map((m) => (
                      <SelectItem key={m.user!.id} value={m.user!.id}>
                        {m.user!.name || m.user!.email}
                        {m.status !== "active" ? " (ex-miembro)" : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:max-w-xs">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Buscar por archivo"
              aria-label="Buscar por archivo"
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => {
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
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {DATE_PRESETS.map((d) => {
              const active = datePreset === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDatePreset(d.key)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <span className="text-muted-foreground text-xs tabular-nums">
            {isRefetching ? "Buscando…" : `${totalItems} resultado${totalItems === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {items.length === 0 && !isRefetching ? (
        hasActiveFilters ? (
          <EmptyState
            icon={SearchX}
            title="Sin resultados"
            description="Nadie coincide con estos filtros. Probá ajustarlos."
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title={
              showingTeam ? "Tu equipo todavía no envió solicitudes" : "Todavía no enviaste solicitudes"
            }
            description="Cuando se envíen archivos a procesamiento, van a aparecer acá con su estado."
          />
        )
      ) : (
        <>
          <SubmissionsTable items={items} showAuthor={showingTeam} memberStatusById={memberStatusById} />
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoadingMore}>
                {isLoadingMore && <Loader2 className="animate-spin" />}
                Cargar más
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
