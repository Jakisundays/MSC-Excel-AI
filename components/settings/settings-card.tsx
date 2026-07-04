import { cn } from "@/lib/utils";

export function SettingsCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col gap-6 rounded-2xl border p-5 sm:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsPageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="hidden md:block">
      <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>
    </div>
  );
}
