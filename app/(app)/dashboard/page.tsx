import Link from "next/link";
import { ArrowRight, FilePlus2 } from "lucide-react";

import { getSession } from "@/lib/auth";
import { listSubmissions } from "@/lib/submissions";
import { StatCard } from "@/components/stat-card";
import { SubmissionsTable } from "@/components/submissions-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import type { SubmissionRecord } from "@/lib/pocketbase/types";

export const metadata = { title: "Resumen" };

function inMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  );
}

/** null cuando no hay base de comparación (mes anterior sin datos) — nunca NaN/Infinity. */
function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

export default async function DashboardPage() {
  const session = await getSession();
  const { items } = session
    ? await listSubmissions(session.id)
    : { items: [] as SubmissionRecord[] };

  const now = new Date();
  const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const thisMonthItems = items.filter((s) => inMonth(s.created, now));
  const lastMonthItems = items.filter((s) => inMonth(s.created, lastMonthRef));

  const thisMonthCompleted = thisMonthItems.filter((s) => s.status === "completed");
  const lastMonthCompleted = lastMonthItems.filter((s) => s.status === "completed");
  const thisMonthFailed = thisMonthItems.filter((s) => s.status === "failed");
  const lastMonthFailed = lastMonthItems.filter((s) => s.status === "failed");

  const activeCount = items.filter(
    (s) => s.status === "pending" || s.status === "processing",
  ).length;
  const completedAll = items.filter((s) => s.status === "completed").length;
  const failedAll = items.filter((s) => s.status === "failed").length;
  const completionRate = items.length > 0 ? (completedAll / items.length) * 100 : 0;

  // KPI "Respuesta prom.": completed_at - created, promedio sobre las
  // solicitudes completadas del mes en curso.
  const responseTimesMs = thisMonthCompleted
    .filter((s) => s.completed_at)
    .map((s) => new Date(s.completed_at).getTime() - new Date(s.created).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= 0);
  const avgResponseMs =
    responseTimesMs.length > 0
      ? responseTimesMs.reduce((a, b) => a + b, 0) / responseTimesMs.length
      : null;

  const recent = items.slice(0, 5);

  const totalDelta = pctDelta(thisMonthItems.length, lastMonthItems.length);
  const completedDelta = pctDelta(thisMonthCompleted.length, lastMonthCompleted.length);
  const failedDelta = pctDelta(thisMonthFailed.length, lastMonthFailed.length);

  const breakdown = [
    { label: "Completadas", count: completedAll, cls: "bg-success" },
    { label: "En proceso", count: activeCount, cls: "bg-muted-foreground" },
    { label: "Con error", count: failedAll, cls: "bg-destructive" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-medium tracking-tight">Resumen</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Estado de tus solicitudes, hoy.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Solicitudes (mes)"
          value={thisMonthItems.length}
          delta={totalDelta === null ? null : { pct: totalDelta }}
          delay={0}
        />
        <StatCard
          label="En proceso"
          value={activeCount}
          hint="activas"
          delay={60}
        />
        <StatCard
          label="Completadas (mes)"
          value={thisMonthCompleted.length}
          delta={completedDelta === null ? null : { pct: completedDelta }}
          delay={120}
        />
        <StatCard
          label="Fallidas (mes)"
          value={thisMonthFailed.length}
          accent={thisMonthFailed.length > 0 ? "danger" : undefined}
          delta={
            failedDelta === null
              ? null
              : { pct: failedDelta, goodDirection: "down" }
          }
          delay={180}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section
          className="bg-card animate-in fade-in-0 slide-in-from-bottom-2 rounded-2xl border duration-500"
          style={{ animationDelay: "240ms", animationFillMode: "both" }}
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
            <h2 className="text-sm font-medium">Actividad reciente</h2>
            {items.length > 0 && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground -mr-2"
              >
                <Link href="/historial">
                  Ver historial
                  <ArrowRight />
                </Link>
              </Button>
            )}
          </div>

          {recent.length > 0 ? (
            <div className="[&_tbody_tr:last-child]:border-0 px-3 py-1 sm:px-4">
              <SubmissionsTable items={recent} bare />
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                icon={FilePlus2}
                title="Sin actividad todavía"
                description="Creá tu primera solicitud para enviar archivos al equipo de procesamiento."
                action={
                  <Button asChild size="sm">
                    <Link href="/nueva-solicitud">Nueva solicitud</Link>
                  </Button>
                }
              />
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <div
            className="bg-brand-panel text-brand-panel-foreground ring-brand-panel-foreground/10 animate-in fade-in-0 slide-in-from-bottom-2 relative overflow-hidden rounded-2xl p-5 ring-1 duration-500"
            style={{ animationDelay: "300ms", animationFillMode: "both" }}
          >
            <div className="text-brand-panel-foreground/50 text-[10px] font-medium tracking-wider uppercase">
              Tasa de completado
            </div>
            <div className="mt-2.5 mb-3.5 flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-medium tracking-tight tabular-nums">
                {completionRate.toFixed(1)}
              </span>
              <span className="text-brand-panel-foreground/60 text-sm">%</span>
            </div>
            <div className="bg-brand-panel-foreground/12 h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${Math.min(100, completionRate)}%` }}
              />
            </div>
            <div className="text-brand-panel-foreground/50 mt-2.5 flex justify-between font-mono text-[11px]">
              <span>{completedAll} completadas</span>
              <span>{items.length} totales</span>
            </div>
          </div>

          <div
            className="bg-card animate-in fade-in-0 slide-in-from-bottom-2 rounded-2xl border p-5 duration-500"
            style={{ animationDelay: "360ms", animationFillMode: "both" }}
          >
            <h3 className="mb-3 text-sm font-medium">Por estado</h3>
            <div className="flex flex-col gap-2.5">
              {breakdown.map((b) => (
                <div key={b.label} className="flex items-center gap-2.5">
                  <span
                    className={cn("size-2 shrink-0 rounded-full", b.cls)}
                    aria-hidden
                  />
                  <span className="flex-1 text-sm">{b.label}</span>
                  <span className="font-mono text-sm font-medium tabular-nums">
                    {b.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="bg-card animate-in fade-in-0 slide-in-from-bottom-2 rounded-2xl border p-5 duration-500"
            style={{ animationDelay: "420ms", animationFillMode: "both" }}
          >
            <p className="text-muted-foreground text-xs font-medium">
              Respuesta prom. (mes)
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                {avgResponseMs === null ? "—" : formatDuration(avgResponseMs)}
              </span>
              {avgResponseMs !== null && (
                <span className="text-muted-foreground text-xs">
                  sobre {responseTimesMs.length}{" "}
                  {responseTimesMs.length === 1 ? "solicitud" : "solicitudes"}
                </span>
              )}
            </div>
            {avgResponseMs === null && (
              <p className="text-muted-foreground mt-1 text-xs">
                Sin solicitudes completadas este mes todavía.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
