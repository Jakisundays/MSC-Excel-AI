import "server-only";

import { getServerPb } from "@/lib/pocketbase/server";
import { DEV_PREVIEW } from "@/lib/preview";
import { listCompanyMembers } from "@/lib/company";
import type { Session } from "@/lib/auth";
import type { SubmissionRecord, SubmissionStatus, UserRecord } from "@/lib/pocketbase/types";

const MOCK: SubmissionRecord[] = [
  {
    id: "m1",
    user: "dev-user",
    file_a_name: "cartera_marzo.xlsx",
    file_b_name: "siniestros_q1.xlsx",
    file_a_size: 254_318,
    file_b_size: 512_940,
    sheet_a: "Resumen",
    sheet_b: "Detalle",
    reply_to: ["analista@dinardi.com.ar"],
    orchestrator_request_id: "abc123",
    attachments: ["doc_a_cartera_marzo.xlsx", "doc_b_siniestros_q1.xlsx"],
    status: "completed",
    error: "",
    result_file: "resultado_cartera_marzo.xlsx",
    result_file_size: 331_442,
    processing_started_at: "2026-06-28T14:30:30Z",
    completed_at: "2026-06-28T14:52:10Z",
    ai_agent_job_id: "job-abc123",
    history: [],
    created: "2026-06-28T14:30:00Z",
    updated: "2026-06-28T14:52:10Z",
  },
  {
    id: "m2",
    user: "dev-user",
    file_a_name: "polizas_abril.xlsx",
    file_b_name: "comparativa.xlsx",
    file_a_size: 98_304,
    file_b_size: 143_872,
    sheet_a: "Hoja1",
    sheet_b: "Vigentes",
    reply_to: [],
    orchestrator_request_id: "def456",
    attachments: ["doc_a_polizas_abril.xlsx", "doc_b_comparativa.xlsx"],
    status: "processing",
    error: "",
    result_file: "",
    result_file_size: 0,
    processing_started_at: "2026-06-27T09:15:20Z",
    completed_at: "",
    ai_agent_job_id: "",
    history: [],
    created: "2026-06-27T09:15:00Z",
    updated: "2026-06-27T09:15:20Z",
  },
  {
    id: "m3",
    user: "dev-user",
    file_a_name: "datos_mayo.xls",
    file_b_name: "base.xlsx",
    file_a_size: 621_005,
    file_b_size: 88_211,
    sheet_a: "Datos",
    sheet_b: "Maestro",
    reply_to: ["ops@witworks.cloud"],
    orchestrator_request_id: "",
    attachments: [],
    status: "failed",
    error: "SMTP timeout",
    result_file: "",
    result_file_size: 0,
    processing_started_at: "",
    completed_at: "",
    ai_agent_job_id: "",
    history: [],
    created: "2026-06-26T17:42:00Z",
    updated: "2026-06-26T18:03:00Z",
  },
];

export async function listSubmissions(
  userId: string,
): Promise<{ items: SubmissionRecord[]; error: boolean }> {
  if (DEV_PREVIEW) return { items: MOCK, error: false };

  try {
    const pb = await getServerPb();
    const res = await pb.collection("submissions").getList(1, 200, {
      sort: "-created",
      filter: pb.filter("user = {:userId}", { userId }),
    });
    return { items: res.items as unknown as SubmissionRecord[], error: false };
  } catch {
    return { items: [], error: true };
  }
}

export interface SubmissionWithAuthor extends SubmissionRecord {
  /** Solo se completa cuando se está viendo el proceso de un compañero (modo equipo). */
  authorName?: string;
  authorEmail?: string;
}

/**
 * Una solicitud puntual (para Detalle). Verifica ownership o pertenencia a
 * la misma empresa además de la regla de PocketBase (defensa en profundidad,
 * mismo patrón que ya usa este archivo).
 *
 * Si quien mira no es el dueño (lo está viendo en modo equipo), `reply_to`
 * se enmascara: es texto libre que el creador tipeó sin ninguna validación
 * de que sea un dato operativo del negocio (ver auditoría de campos, Fase 0
 * del plan de Historial de equipo) — nunca se expone a otros miembros.
 */
export async function getSubmission(
  session: Session,
  id: string,
): Promise<SubmissionWithAuthor | null> {
  if (DEV_PREVIEW) return MOCK.find((m) => m.id === id) ?? null;

  try {
    const pb = await getServerPb();
    const rec = await pb.collection("submissions").getOne(id, { expand: "user" });
    const submission = rec as unknown as SubmissionRecord;

    const isOwner = submission.user === session.id;
    const canSeeTeamSubmission =
      !isOwner && !!session.company && submission.company === session.company;

    if (!isOwner && !canSeeTeamSubmission) return null;
    if (isOwner) return submission;

    const author = (rec as unknown as { expand?: { user?: UserRecord } }).expand?.user;
    return {
      ...submission,
      reply_to: [],
      authorName: author?.name || author?.email || "",
      authorEmail: author?.email || "",
    };
  } catch {
    return null;
  }
}

export async function countSubmissions(userId: string): Promise<number> {
  if (DEV_PREVIEW) return MOCK.length;

  try {
    const pb = await getServerPb();
    const res = await pb.collection("submissions").getList(1, 1, {
      filter: pb.filter("user = {:userId}", { userId }),
    });
    return res.totalItems;
  } catch {
    return 0;
  }
}

/** Comparaciones que la empresa ya usó en el mes calendario en curso (para el cupo pooled del plan). */
export async function countCompanySubmissionsThisMonth(
  companyId: string,
): Promise<number> {
  if (DEV_PREVIEW) return MOCK.length;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  try {
    const pb = await getServerPb();
    const res = await pb.collection("submissions").getList(1, 1, {
      filter: pb.filter("company = {:companyId} && created >= {:startOfMonth}", {
        companyId,
        startOfMonth,
      }),
    });
    return res.totalItems;
  } catch {
    return 0;
  }
}

// ── Historial de equipo (búsqueda paginada, mine|team) ──────────────────

export type SubmissionsScope = "mine" | "team";

export interface SubmissionsSearchParams {
  scope?: SubmissionsScope;
  /** Solo se aplica si el scope resuelto termina siendo "team". */
  memberId?: string;
  status?: SubmissionStatus | "all";
  q?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  perPage?: number;
}

export interface SubmissionsSearchResult {
  items: SubmissionWithAuthor[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  hasMore: boolean;
  /** Lo que realmente se aplicó tras resolver permisos — puede diferir de lo pedido. */
  scopeApplied: SubmissionsScope;
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 50;

/**
 * Resuelve el scope real a partir de lo pedido, sin confiar nunca en el
 * cliente: `scope=team` solo es válido si la cuenta pertenece a una
 * empresa (cualquier rol — decisión de producto, jul 2026), y un
 * `memberId` solo se acepta si pertenece a esa MISMA empresa (mitiga el
 * patrón de bug "usuario de empresa A pasa un id de empresa B", ver
 * antecedente de auditoría de Buses Panamá). Fail-closed: si no se puede
 * verificar la membresía, nunca se asume válida.
 */
export async function resolveScope(
  session: Session,
  requested: { scope?: string; memberId?: string },
): Promise<{ scope: SubmissionsScope; memberId?: string }> {
  const canSeeTeam = !!session.company;
  if (requested.scope !== "team" || !canSeeTeam) return { scope: "mine" };
  if (!requested.memberId) return { scope: "team" };

  let members;
  try {
    members = await listCompanyMembers(session.company);
  } catch {
    // Fail-closed: nunca se asume válido un memberId sin verificar contra
    // la empresa real de la sesión — se cae a "team" sin filtro de miembro
    // (nunca a "mine", que sería una degradación silenciosa distinta de la
    // pedida) y nunca a un memberId no confirmado.
    return { scope: "team" };
  }

  const target = members.find((m) => m.user?.id === requested.memberId);
  return target ? { scope: "team", memberId: target.user!.id } : { scope: "team" };
}

/** Arma el filtro de PocketBase, siempre parametrizado (nunca concatenación cruda de `q`). */
export function buildFilter(
  pb: Awaited<ReturnType<typeof getServerPb>>,
  session: Session,
  p: {
    scope: SubmissionsScope;
    memberId?: string;
    status?: SubmissionStatus | "all";
    q?: string;
    createdFrom?: string;
    createdTo?: string;
  },
): string {
  const clauses: string[] = [];
  const bind: Record<string, string> = {};

  if (p.scope === "team") {
    clauses.push("company = {:companyId}");
    bind.companyId = session.company;
    if (p.memberId) {
      clauses.push("user = {:memberId}");
      bind.memberId = p.memberId;
    }
  } else {
    clauses.push("user = {:userId}");
    bind.userId = session.id;
  }

  if (p.status && p.status !== "all") {
    clauses.push("status = {:status}");
    bind.status = p.status;
  }

  const q = p.q?.slice(0, 100).trim();
  if (q) {
    // Mismo criterio que la búsqueda actual del cliente: nombre de
    // cualquiera de los dos archivos.
    clauses.push("(file_a_name ~ {:q} || file_b_name ~ {:q})");
    bind.q = q;
  }

  if (p.createdFrom) {
    clauses.push("created >= {:createdFrom}");
    bind.createdFrom = p.createdFrom;
  }
  if (p.createdTo) {
    clauses.push("created <= {:createdTo}");
    bind.createdTo = p.createdTo;
  }

  return pb.filter(clauses.join(" && "), bind);
}

const MOCK_SEARCH_RESULT: SubmissionsSearchResult = {
  items: MOCK,
  page: 1,
  perPage: DEFAULT_PER_PAGE,
  totalItems: MOCK.length,
  totalPages: 1,
  hasMore: false,
  scopeApplied: "mine",
};

/**
 * Búsqueda paginada de submissions, con soporte de "mine" (default, igual
 * comportamiento de siempre) y "team" (cualquier rol de la empresa, ver
 * decisión de producto — el filtro de PocketBase real vive en la regla
 * listRule/viewRule de la colección, esto es defensa en profundidad +
 * construcción de query, no la única barrera).
 */
export async function searchSubmissions(
  session: Session,
  params: SubmissionsSearchParams,
): Promise<SubmissionsSearchResult> {
  if (DEV_PREVIEW) return MOCK_SEARCH_RESULT;

  const perPage = Math.min(Math.max(params.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const page = Math.max(params.page ?? 1, 1);

  const pb = await getServerPb();
  const { scope, memberId } = await resolveScope(session, params);
  const filter = buildFilter(pb, session, {
    scope,
    memberId,
    status: params.status,
    q: params.q,
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
  });

  const result = await pb.collection("submissions").getList(page, perPage, {
    sort: "-created",
    filter,
    expand: scope === "team" ? "user" : undefined,
  });

  const items: SubmissionWithAuthor[] = (result.items as unknown as SubmissionRecord[]).map(
    (item, i) => {
      if (scope !== "team") return item;
      const author = (result.items[i] as unknown as { expand?: { user?: UserRecord } }).expand
        ?.user;
      return {
        ...item,
        authorName: author?.name || author?.email || "",
        authorEmail: author?.email || "",
      };
    },
  );

  return {
    items,
    page: result.page,
    perPage: result.perPage,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
    hasMore: result.page < result.totalPages,
    scopeApplied: scope,
  };
}
