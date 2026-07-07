import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { searchSubmissions } from "@/lib/submissions";
import { checkRateLimit } from "@/lib/rate-limit";
import type { SubmissionStatus } from "@/lib/pocketbase/types";

const STATUSES = new Set<SubmissionStatus>(["pending", "processing", "completed", "failed"]);

/**
 * Búsqueda paginada de Historial (mine|team). Usada por el frontend para
 * "cargar más" y cambios de filtro post-carga inicial — la carga inicial
 * de /historial llama a searchSubmissions() directo desde el server
 * component, sin pasar por acá.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!checkRateLimit(`submissions-search:${session.id}`, 30, 60_000)) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Esperá un minuto e intentá de nuevo." },
      { status: 429 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope") === "team" ? "team" : "mine";
  const memberId = sp.get("member") || undefined;
  const statusParam = sp.get("status") || "all";
  const status = STATUSES.has(statusParam as SubmissionStatus)
    ? (statusParam as SubmissionStatus)
    : "all";
  const q = (sp.get("q") || "").slice(0, 100);
  const createdFrom = sp.get("from") || undefined;
  const createdTo = sp.get("to") || undefined;
  const page = Math.max(Number(sp.get("page")) || 1, 1);
  const perPage = Number(sp.get("perPage")) || 20;

  // scope=team pedido explícitamente sin empresa: error claro, no una
  // degradación silenciosa a "mine" (que haría que la UI mienta sobre qué
  // está mostrando). La degradación silenciosa por falta de PERMISO vive
  // dentro de resolveScope; acá el problema es de estado, no de permiso.
  if (scope === "team" && !session.company) {
    return NextResponse.json(
      { error: "Tu cuenta no pertenece a ninguna empresa." },
      { status: 400 },
    );
  }

  const result = await searchSubmissions(session, {
    scope,
    memberId,
    status,
    q,
    createdFrom,
    createdTo,
    page,
    perPage,
  });

  if (result.scopeApplied === "team") {
    // Auditoría obligatoria (no opcional): quién vio el historial de
    // equipo de qué empresa, y si filtró por un miembro puntual.
    console.info(
      "[submissions:search:team]",
      JSON.stringify({
        actorId: session.id,
        companyId: session.company,
        memberIdFilter: memberId ?? null,
        at: new Date().toISOString(),
      }),
    );
  }

  return NextResponse.json(result);
}
