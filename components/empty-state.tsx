import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative isolate flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed px-6 py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center [mask-image:radial-gradient(circle_at_center,black,transparent_72%)]"
      >
        <div className="border-border/70 absolute size-28 rounded-full border" />
        <div className="border-border/45 absolute size-48 rounded-full border" />
        <div className="border-border/25 absolute size-72 rounded-full border" />
      </div>

      <div className="bg-card text-muted-foreground animate-in fade-in-0 zoom-in-95 flex size-12 items-center justify-center rounded-xl border shadow-sm duration-500">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="mt-4 text-sm font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm text-pretty">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
