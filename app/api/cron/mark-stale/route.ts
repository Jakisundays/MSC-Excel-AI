import { NextRequest, NextResponse, after } from "next/server";

import { getAdminPb } from "@/lib/pocketbase/admin";
import { env } from "@/lib/env";
import { DEV_PREVIEW } from "@/lib/preview";
import { notifySubmissionResult } from "@/lib/notify";
import type { SubmissionHistoryEntry, SubmissionRecord } from "@/lib/pocketbase/types";

/**
 * Job de SLA (plan §13, endurecimiento fase 3): marca como `failed` toda
 * solicitud que quedó en `processing` más allá del SLA sin que el AI Agent
 * llamara nunca al webhook de cierre ("job huérfano"). Pensado para correr
 * como Vercel Cron (ver vercel.json) — protegido con CRON_SECRET.
 */
const SLA_HOURS = 48;

// Mismo criterio que el webhook de cierre: after() no extiende el límite
// total de duración de la función, solo cuándo se envía la respuesta.
export const maxDuration = 60;

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
    // Re-chequeo pegado a la escritura: el webhook de cierre puede estar
    // resolviendo este mismo submission en simultáneo (misma ventana de
    // carrera que docs/e2e-testing-findings.md §1). El SDK de PocketBase no
    // soporta un update condicionado por filtro, así que la mitigación
    // disponible es reducir la ventana releyendo el estado fresco
    // inmediatamente antes de escribir en vez de confiar en el `s` obtenido
    // en el listado de arriba (que puede tener segundos de antigüedad si el
    // lote es grande).
    let fresh: SubmissionRecord;
    try {
      fresh = (await pb
        .collection("submissions")
        .getOne(s.id)) as unknown as SubmissionRecord;
    } catch (e) {
      console.error("[cron/mark-stale] no se pudo releer", s.id, e);
      continue;
    }
    if (fresh.status !== "processing") {
      // El webhook (u otra corrida) ya lo cerró -- no pisar.
      console.warn(
        "[cron/mark-stale] submission ya no está 'processing', se omite:",
        s.id,
        "estado actual:",
        fresh.status,
      );
      continue;
    }

    const nowIso = new Date().toISOString();
    const historyEntry: SubmissionHistoryEntry = {
      at: nowIso,
      from: fresh.status,
      to: "failed",
      note: `SLA vencido (${SLA_HOURS}h) sin callback del AI Agent.`,
    };
    const history = [...(fresh.history ?? []), historyEntry];
    let written: SubmissionRecord;
    try {
      written = (await pb.collection("submissions").update(s.id, {
        status: "failed",
        error: `El procesamiento no se completó dentro de ${SLA_HOURS}h. Si esperabas un resultado, contactá al equipo.`,
        completed_at: nowIso,
        notified_at: nowIso,
        history,
      })) as unknown as SubmissionRecord;
      marked++;
    } catch (e) {
      // No interrumpir el resto del lote por un fallo puntual (§13: nunca crashear).
      console.error("[cron/mark-stale] no se pudo marcar", s.id, e);
      continue;
    }

    // Mismo guard post-escritura que el webhook de cierre: si el `history`
    // persistido difiere en longitud del que mandamos, el webhook ganó la
    // carrera en el medio -- no duplicar notificación.
    if ((written.history?.length ?? 0) !== history.length) {
      console.error(
        "[cron/mark-stale] posible escritura concurrente detectada tras update:",
        s.id,
      );
      continue;
    }

    // notifySubmissionResult() ahora es liviana (ver comentario en el
    // webhook de cierre): el envío real del email lo resuelve el backend
    // en su propia invocación. after() la sigue corriendo en segundo
    // plano por las dudas, con un lote grande de submissions stale.
    const submissionId = s.id;
    const freshForNotify = fresh;
    after(async () => {
      try {
        await notifySubmissionResult(
          pb,
          { ...freshForNotify, status: "failed", notified_at: nowIso } as SubmissionRecord,
          "submission_timeout",
        );
      } catch (e) {
        console.error("[cron/mark-stale] no se pudo notificar", submissionId, e);
      }
    });
  }

  return NextResponse.json({ ok: true, marked, checked: stale.length });
}
