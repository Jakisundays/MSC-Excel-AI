/** Duracion legible a partir de milisegundos (ej. "42m", "3.2h", "1.5d"). */
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

// Node (SSR) y el motor del navegador formatean "a. m." / "p. m." con un
// caracter de espacio distinto para es-AR (confirmado corriendo el mismo
// Intl.DateTimeFormat en Node vs. en el navegador): mismo texto visible,
// distinto contenido real del nodo de texto, asi que React marca un
// hydration mismatch en cada render de components/submissions-table.tsx.
// Se normaliza reemplazando por codigo (String.fromCharCode), no con el
// caracter pegado literalmente en el fuente, para que el reemplazo sea
// inequivoco: 160 = NBSP, 8199 = figure space, 8201 = thin space,
// 8239 = narrow NBSP, 12288 = ideographic space.
const EXOTIC_SPACE_CODES = [160, 8199, 8201, 8239, 12288];
const EXOTIC_SPACES_PATTERN =
  "[" + EXOTIC_SPACE_CODES.map((code) => String.fromCharCode(code)).join("") + "]";
const EXOTIC_SPACES = new RegExp(EXOTIC_SPACES_PATTERN, "g");

function normalizeSpaces(value: string): string {
  return value.replace(EXOTIC_SPACES, " ");
}

export function formatDateTime(iso: string): string {
  try {
    return normalizeSpaces(DT.format(new Date(iso)));
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
    return normalizeSpaces(D.format(d));
  } catch {
    return iso;
  }
}
