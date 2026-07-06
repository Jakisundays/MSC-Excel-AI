/** Tipos de las colecciones de PocketBase usadas por la app. */

export type SubmissionStatus = "pending" | "processing" | "completed" | "failed";

export interface SubmissionHistoryEntry {
  at: string;
  from: SubmissionStatus | "";
  to: SubmissionStatus;
  note?: string;
}

export interface SubmissionRecord {
  id: string;
  user: string;
  /** Empresa dueña del submission. Opcional porque el campo queda sin `required` en PocketBase hasta que el backfill (scripts/migrate-to-companies.mjs) llegue a 0 huérfanos. */
  company?: string;
  file_a_name: string;
  file_b_name: string;
  file_a_size: number;
  file_b_size: number;
  sheet_a: string;
  sheet_b: string;
  reply_to: string[];
  orchestrator_request_id: string;
  attachments: string[];
  status: SubmissionStatus;
  error: string;
  /** Nombre del archivo de resultado en PocketBase (campo `file`), vacío si no hay. */
  result_file: string;
  result_file_size: number;
  processing_started_at: string;
  completed_at: string;
  ai_agent_job_id: string;
  history: SubmissionHistoryEntry[];
  created: string;
  updated: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  city?: string;
  birth_date?: string;
  address?: string;
  /** Vacío si la cuenta todavía no eligió ningún plan. @deprecated reemplazado por subscriptions.plan a nivel de empresa; se conserva solo como fuente para el backfill de la migración B2B. */
  plan?: "esencial" | "profesional" | "corporativo" | "";
  plan_selected_at?: string;
  /**
   * Denormalizado desde company_members (fuente de verdad) para que las
   * API rules de otras colecciones puedan filtrar por @request.auth.company
   * / @request.auth.company_role sin back-relation (PocketBase no permite
   * expresar "_via_" con AND compuesto de forma segura). Nunca escribible
   * desde el cliente — ver users.updateRule en scripts/pb-migrations/001-b2b-schema.mjs.
   */
  company?: string;
  company_role?: CompanyRole;
  created: string;
  updated: string;
}

// ── B2B / multi-tenant ──────────────────────────────────────────

export type CompanyRole = "owner" | "admin" | "member";
export type CompanyMemberStatus = "active" | "invited" | "suspended";
export type CompanyStatus = "active" | "suspended" | "archived";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type SubscriptionEventType =
  | "created"
  | "plan_changed"
  | "renewed"
  | "canceled"
  | "reactivated";

export interface PlanRecord {
  id: string;
  key: string;
  name: string;
  price_cents: number;
  currency: string;
  /** Cuota mensual pooled por empresa, no por usuario. */
  max_comparisons_month: number;
  /** 0 o null = ilimitado. */
  max_seats: number | null;
  overage_cents_per_unit: number | null;
  /** Plan enterprise negociado 1:1, no ofrecido en el catálogo público. */
  is_custom: boolean;
  active: boolean;
  created: string;
  updated: string;
}

export interface CompanyRecord {
  id: string;
  name: string;
  slug: string;
  email_domain: string;
  /** Nunca usar email_domain para auto-join de nuevos miembros sin que esto sea true. */
  domain_verified: boolean;
  owner: string;
  status: CompanyStatus;
  created: string;
  updated: string;
}

export interface CompanyMemberRecord {
  id: string;
  company: string;
  user: string;
  role: CompanyRole;
  status: CompanyMemberStatus;
  invited_by?: string;
  created: string;
  updated: string;
}

export interface SubscriptionRecord {
  id: string;
  company: string;
  plan: string;
  status: SubscriptionStatus;
  /** Override sobre plans.max_seats para deals negociados a medida. */
  seats_purchased?: number | null;
  /** Override sobre plans.max_comparisons_month. */
  usage_limit_override?: number | null;
  current_period_start: string;
  current_period_end: string;
  created: string;
  updated: string;
}

export interface SubscriptionEventRecord {
  id: string;
  subscription: string;
  type: SubscriptionEventType;
  from_plan?: string;
  to_plan?: string;
  metadata?: Record<string, unknown>;
  created: string;
  updated: string;
}

export interface InvitationRecord {
  id: string;
  company: string;
  email: string;
  role: Extract<CompanyRole, "admin" | "member">;
  token: string;
  status: InvitationStatus;
  invited_by: string;
  expires_at: string;
  created: string;
  updated: string;
}
