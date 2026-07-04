/** Duración legible a partir de milisegundos (ej. "42m", "3.2h", "1.5d"). */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const minutes = ms / 60_000;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// timeZone fijo (no el del entorno): sin esto, el server (Node, TZ del
// contenedor) y el cliente (TZ del navegador) formatean la misma fecha
// distinto y React tira un hydration mismatch en cualquier client
// component que use este formateador (ver components/submissions-table.tsx).
const TIME_ZONE = "America/Argentina/Buenos_Aires";

const DT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const D = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  timeZone: TIME_ZONE,
});

export function formatDateTime(iso: string): string {
  try {
    return DT.format(new Date(iso));
  } catch {
    return iso;
  }
}

/** "hoy" / "ayer" / fecha corta. */
export function relativeDay(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const days = Math.floor(
      (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
        new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
        86400000,
    );
    if (days <= 0) return "hoy";
    if (days === 1) return "ayer";
    return D.format(d);
  } catch {
    return iso;
  }
}
