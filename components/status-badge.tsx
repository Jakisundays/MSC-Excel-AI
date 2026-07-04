import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const CONFIG = {
  completed: { label: "Completada", Icon: CheckCircle2, cls: "bg-success/10 text-success" },
  failed: {
    label: "Error",
    Icon: XCircle,
    cls: "bg-destructive/10 text-destructive",
  },
  processing: {
    label: "En revisión",
    Icon: Clock,
    cls: "bg-muted text-muted-foreground",
  },
  pending: {
    label: "Registrada",
    Icon: Clock,
    cls: "bg-muted text-muted-foreground",
  },
} as const;

export function StatusBadge({ status }: { status: string }) {
  const c = CONFIG[status as keyof typeof CONFIG] ?? CONFIG.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        c.cls,
      )}
    >
      <c.Icon className="size-3" aria-hidden />
      {c.label}
    </span>
  );
}
