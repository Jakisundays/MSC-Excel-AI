import { NextRequest, NextResponse } from "next/server";

import { getAdminPb } from "@/lib/pocketbase/admin";
import { env } from "@/lib/env";
import { DEV_PREVIEW } from "@/lib/preview";
import type { SubmissionHistoryEntry, SubmissionRecord } from "@/lib/pocketbase/types";

/**
 * Job de SLA (plan §13, endurecimiento fase 3): marca como `failed` toda
 * solicitud que quedó en `processing` más allá del SLA sin que el AI Agent
 * llamara nunca al webhook de cierre ("job huérfano"). Pensado para correr
 * como Vercel Cron (ver vercel.json) — protegido con CRON_SECRET.
 */
const SLA_HOURS = 48;

export async function GET(req: NextRequest) {
  if (DEV_PREVIEW) {
    return NextResponse.json({ ok: true, marked: 0 });
  }

  const auth = req.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const pb = await getAdminPb();
  const cutoff = new Date(Date.now() - SLA_HOURS * 60 * 60 * 1000).toISOString();

  let stale: SubmissionRecord[];
  try {
    stale = (await pb.collection("submissions").getFullList({
      filter: pb.filter("status = 'processing' && updated < {:cutoff}", { cutoff }),
    })) as unknown as SubmissionRecord[];
  } catch (e) {
    console.error("[cron/mark-stale] error listando submissions:", e);
    return NextResponse.json({ ok: false, error: "list failed" }, { status: 500 });
  }

  let marked = 0;
  for (const s of stale) {
    const nowIso = new Date().toISOString();
    const historyEntry: SubmissionHistoryEntry = {
      at: nowIso,
      from: s.status,
      to: "failed",
      note: `SLA vencido (${SLA_HOURS}h) sin callback del AI Agent.`,
    };
    try {
      await pb.collection("submissions").update(s.id, {
        status: "failed",
        error: `El procesamiento no se completó dentro de ${SLA_HOURS}h. Si esperabas un resultado, contactá al equipo.`,
        completed_at: nowIso,
        history: [...(s.history ?? []), historyEntry],
      });
      marked++;
    } catch (e) {
      // No interrumpir el resto del lote por un fallo puntual (§13: nunca crashear).
      console.error("[cron/mark-stale] no se pudo marcar", s.id, e);
    }
  }

  return NextResponse.json({ ok: true, marked, checked: stale.length });
}
