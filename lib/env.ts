import "server-only";

/**
 * Acceso centralizado a variables de entorno del SERVIDOR.
 * No importar desde componentes cliente.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    // No tiramos en build para no romper `next build` sin envs;
    // fallamos en runtime cuando realmente se usa.
    console.warn(`[env] Falta la variable ${name}`);
  }
  return value ?? "";
}

export const env = {
  POCKETBASE_URL: required(
    "POCKETBASE_URL",
    process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL,
  ),
  ORCHESTRATOR_URL: required(
    "NEXT_PUBLIC_ORCHESTRATOR_URL",
    process.env.NEXT_PUBLIC_ORCHESTRATOR_URL,
  ),
  APP_URL: process.env.APP_URL || "http://localhost:3000",
  UPLOAD_TICKET_SECRET: required(
    "UPLOAD_TICKET_SECRET",
    process.env.UPLOAD_TICKET_SECRET,
  ),
  ALLOWED_EMAIL_DOMAINS: process.env.ALLOWED_EMAIL_DOMAINS || "",
  ALLOWED_EMAILS: process.env.ALLOWED_EMAILS || "",
  IS_PROD: process.env.NODE_ENV === "production",
  POCKETBASE_ADMIN_EMAIL: required(
    "POCKETBASE_ADMIN_EMAIL",
    process.env.POCKETBASE_ADMIN_EMAIL,
  ),
  POCKETBASE_ADMIN_PASSWORD: required(
    "POCKETBASE_ADMIN_PASSWORD",
    process.env.POCKETBASE_ADMIN_PASSWORD,
  ),
  // Secreto del webhook de cierre (hop orchestrator -> Next.js). DISTINTO
  // de UPLOAD_TICKET_SECRET: server-to-server, larga duración.
  RESULT_WEBHOOK_SECRET: required(
    "RESULT_WEBHOOK_SECRET",
    process.env.RESULT_WEBHOOK_SECRET,
  ),
  // Autoriza el cron job de SLA (app/api/cron/mark-stale). Vacío = ruta
  // deshabilitada (fail-closed) hasta configurarlo.
  CRON_SECRET: process.env.CRON_SECRET || "",
  // Rollout gradual del gate de suscripción B2B (Fase 5/6 del plan
  // corporativo): "off" no valida nada (estado pre-migración), "log" valida
  // y deja pasar igual pero deja rastro en logs (default seguro para
  // detectar falsos positivos contra cuentas ya migradas), "enforce" bloquea
  // de verdad. Nunca pasar a "enforce" antes de correr
  // scripts/migrate-to-companies.mjs con 0 usuarios huérfanos.
  SUBSCRIPTION_GATE_MODE: (process.env.SUBSCRIPTION_GATE_MODE ||
    "log") as "off" | "log" | "enforce",
  // Secreto compartido con POST /send-invitation-email en el orchestrator
  // de verito (mismo valor que INVITATION_EMAIL_SECRET en su .env) — Next.js
  // no tiene SMTP propio, reusa el que ya está configurado ahí (ver
  // lib/mailer.ts). Vacío = no se envía nada, solo se loguea.
  INVITATION_EMAIL_SECRET: process.env.INVITATION_EMAIL_SECRET || "",
  // Web Push (Fase 2, docs/notificaciones-push-plan.md). Par VAPID generado
  // con `npx web-push generate-vapid-keys`. Vacío = el feature degrada en
  // silencio (lib/push.ts no manda nada todavía), mismo criterio que
  // INVITATION_EMAIL_SECRET arriba.
  VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || "",
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || "mailto:soporte@dinardi.com.ar",
};

/**
 * Allowlist de acceso. Si no hay dominios ni emails configurados,
 * se permite a cualquier cuenta de Google (útil mientras no tengas la lista).
 */
export function isEmailAllowed(email: string | undefined | null): boolean {
  if (!email) return false;
  const domains = env.ALLOWED_EMAIL_DOMAINS.split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const emails = env.ALLOWED_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (domains.length === 0 && emails.length === 0) return true;

  const lower = email.toLowerCase();
  const domain = lower.split("@")[1] ?? "";
  return emails.includes(lower) || domains.includes(domain);
}
