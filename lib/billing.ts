/**
 * Catálogo de planes y tipos — client-safe (sin "server-only"): lo
 * importan tanto componentes cliente (PlansGrid) como el server (API
 * route, páginas). La lógica de persistencia real vive aparte, en
 * lib/billing-server.ts, para no arrastrar "server-only" acá.
 */
export type PlanKey = "esencial" | "profesional" | "corporativo";

export const PLAN_KEYS: readonly PlanKey[] = [
  "esencial",
  "profesional",
  "corporativo",
];

export interface Plan {
  key: PlanKey;
  name: string;
  /** Precio mensual, ya formateado para mostrar (USD). */
  priceLabel: string;
  volumeLabel: string;
  overageLabel: string;
  features: string[];
}

/** Catálogo de planes — única fuente de verdad (evita duplicar precios/features en varios componentes). */
export const PLAN_CATALOG: Record<PlanKey, Plan> = {
  esencial: {
    key: "esencial",
    name: "Esencial",
    priceLabel: "USD 1.000",
    volumeLabel: "Hasta 600 comparaciones al mes",
    overageLabel: "USD 2,00",
    features: [
      "Procesamiento Excel + IA",
      "Notificación automática a destinatarios",
      "Historial y seguimiento de solicitudes",
      "Usuarios del equipo ilimitados",
      "Soporte por correo",
    ],
  },
  profesional: {
    key: "profesional",
    name: "Profesional",
    priceLabel: "USD 1.800",
    volumeLabel: "Hasta 1.200 comparaciones al mes",
    overageLabel: "USD 1,83",
    features: [
      "Procesamiento Excel + IA",
      "Notificación automática a destinatarios",
      "Historial y seguimiento de solicitudes",
      "Usuarios del equipo ilimitados",
      "Soporte prioritario",
    ],
  },
  corporativo: {
    key: "corporativo",
    name: "Corporativo",
    priceLabel: "USD 3.500",
    volumeLabel: "Hasta 2.400 comparaciones al mes",
    overageLabel: "USD 1,75",
    features: [
      "Procesamiento Excel + IA",
      "Notificación automática a destinatarios",
      "Historial y seguimiento de solicitudes",
      "Usuarios del equipo ilimitados",
      "Soporte dedicado y onboarding",
    ],
  },
};

/** Plan que se destaca visualmente como "Recomendado" (no aplica si ya es el plan activo). */
export const RECOMMENDED_PLAN: PlanKey = "profesional";

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (PLAN_KEYS as string[]).includes(value);
}
