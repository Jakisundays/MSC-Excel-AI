import "server-only";

/**
 * Rate limiter simple en memoria, por proceso (ventana deslizante).
 *
 * LIMITACIÓN CONOCIDA: en Vercel (funciones serverless) cada invocación
 * puede caer en una instancia distinta, así que este contador NO es un
 * límite duro compartido entre requests concurrentes o entre cold
 * starts — funciona dentro de una misma instancia "warm", pero no
 * reemplaza un store distribuido. Si el volumen de abuso real lo
 * justifica, migrar a Upstash Redis (`@upstash/ratelimit`) o a las
 * reglas de rate limiting a nivel de plataforma de Vercel (Firewall).
 * Se documenta la limitación en vez de fingir una protección que no es
 * (ver auditoría técnica 2026-07-03, hallazgos Alto 5/7/16).
 */
const hits = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((ts) => now - ts < windowMs);
  if (recent.length >= maxRequests) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
