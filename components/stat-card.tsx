import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  accent,
  delta,
  delay = 0,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "danger";
  delta?: { pct: number; goodDirection?: "up" | "down" } | null;
  delay?: number;
}) {
  const deltaGood = delta
    ? (delta.goodDirection ?? "up") === (delta.pct >= 0 ? "up" : "down")
    : false;

  return (
    <div
      className="bg-card animate-in fade-in-0 slide-in-from-bottom-2 rounded-xl border p-4 duration-500"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-2xl font-semibold tracking-tight tabular-nums",
            accent === "danger" && "text-destructive",
          )}
        >
          {value}
        </span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </div>
      {delta && (
        <div
          className={cn(
            "mt-2 flex items-center gap-1 font-mono text-xs",
            deltaGood ? "text-success" : "text-muted-foreground",
          )}
        >
          {delta.pct >= 0 ? (
            <TrendingUp className="size-3" aria-hidden />
          ) : (
            <TrendingDown className="size-3" aria-hidden />
          )}
          {delta.pct > 0 ? "+" : ""}
          {delta.pct}%
          <span className="text-muted-foreground">vs. mes anterior</span>
        </div>
      )}
    </div>
  );
}
