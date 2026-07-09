import { NextRequest, NextResponse, after } from "next/server";
import { ClientResponseError } from "pocketbase";

import { getAdminPb } from "@/lib/pocketbase/admin";
import { verifyResultWebhookSignature } from "@/lib/webhooks/hmac";
import { env } from "@/lib/env";
import { DEV_PREVIEW } from "@/lib/preview";
import { notifySubmissionResult } from "@/lib/notify";
import type {
  SubmissionHistoryEntry,
  SubmissionRecord,
  SubmissionStatus,
} from "@/lib/pocketbase/types";

/**
 * Webhook de cierre de procesamiento (hop 2, ver docs/procesamiento-async-webhook-plan.md
 * §4.2). Lo llama el orchestrator (nunca el navegador ni el AI Agent
 * directamente) una vez que normalizó el callback del AI Excel Agent
 * externo. Única ruta que escribe `result_file`/`status` final en
 * PocketBase — usa credenciales de superusuario porque no hay sesión de
 * usuario en una llamada server-to-server.
 */
export async function POST(req: NextRequest) {
  if (DEV_PREVIEW) {
    return NextResponse.json({ ok: true, submission_id: "dev", already_processed: false });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid multipart body" }, { status: 400 });
  }

  const requestId = str(form.get("request_id"));
  const status = str(form.get("status"));
  const errorMessage = str(form.get("error_message"));
  const aiAgentJobId = str(form.get("ai_agent_job_id"));
  const processingStartedAtInput = str(form.get("processing_started_at"));
  const resultFile = form.get("result_file");

  if (!requestId) {
    return NextResponse.json({ ok: false, error: "missing request_id" }, { status: 400 });
  }
  if (status !== "completed" && status !== "failed") {
    return NextResponse.json({ ok: false, error: "invalid status" }, { status: 400 });
  }
  if (status === "completed" && !(resultFile instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "result_file is required when status=completed" },
      { status: 400 },
    );
  }
  if (status === "failed" && !errorMessage) {
    return NextResponse.json(
      { ok: false, error: "error_message is required when status=failed" },
      { status: 400 },
    );
  }

  const verification = verifyResultWebhookSignature({
    secret: env.RESULT_WEBHOOK_SECRET,
    requestId,
    status,
    timestampHeader: req.headers.get("x-webhook-timestamp"),
    signatureHeader: req.headers.get("x-webhook-signature"),
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!verification.valid) {
    console.warn("[webhooks/processing-result] firma inválida:", verification.reason);
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  const pb = await getAdminPb();

  let submission: SubmissionRecord;
  try {
    submission = (await pb
      .collection("submissions")
      .getFirstListItem(
        pb.filter("orchestrator_request_id = {:id}", { id: requestId }),
      )) as unknown as SubmissionRecord;
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 404) {
      console.warn("[webhooks/processing-result] request_id desconocido:", requestId);
      return NextResponse.json({ ok: false, error: "unknown request_id" }, { status: 404 });
    }
    console.error("[webhooks/processing-result] error buscando submission:", e);
    return NextResponse.json({ ok: false, error: "lookup failed" }, { status: 500 });
  }

  const isTerminal = submission.status === "completed" || submission.status === "failed";
  if (isTerminal) {
    if (submission.status === status) {
      return NextResponse.json({
        ok: true,
        submission_id: submission.id,
        already_processed: true,
      });
    }
    console.error(
      "[webhooks/processing-result] estado terminal conflictivo:",
      submission.id,
      "actual:",
      submission.status,
      "reportado:",
      status,
    );
    return NextResponse.json(
      { ok: false, error: "conflicting terminal state" },
      { status: 409 },
    );
  }

  // Re-chequeo pegado a la escritura (cierra la ventana de carrera real:
  // el SDK de PocketBase no soporta un update condicionado por filtro/versión
  // -- ver docs/e2e-testing-findings.md §1 -- así que la mitigación
  // disponible sin cambiar el modelo de auth del webhook es minimizar la
  // ventana entre lectura y escritura todo lo posible, releyendo el estado
  // fresco inmediatamente antes de escribir en vez de confiar en el `submission`
  // leído arriba (que puede tener segundos de antigüedad por la validación de
  // firma/HMAC de por medio). Dos callbacks casi simultáneos igual podrían
  // colarse los dos por esta segunda lectura, así que además se verifica
  // DESPUÉS de escribir (ver más abajo) que nadie más ganó la carrera.
  let fresh: SubmissionRecord;
  try {
    fresh = (await pb
      .collection("submissions")
      .getOne(submission.id)) as unknown as SubmissionRecord;
  } catch (e) {
    console.error("[webhooks/processing-result] error releyendo submission:", e);
    return NextResponse.json({ ok: false, error: "lookup failed" }, { status: 500 });
  }
  if (fresh.status === "completed" || fresh.status === "failed") {
    if (fresh.status === status) {
      return NextResponse.json({
        ok: true,
        submission_id: fresh.id,
        already_processed: true,
      });
    }
    console.error(
      "[webhooks/processing-result] estado terminal conflictivo (releído):",
      fresh.id,
      "actual:",
      fresh.status,
      "reportado:",
      status,
    );
    return NextResponse.json(
      { ok: false, error: "conflicting terminal state" },
      { status: 409 },
    );
  }
  submission = fresh;

  const nowIso = new Date().toISOString();
  const historyEntry: SubmissionHistoryEntry = {
    at: nowIso,
    from: submission.status,
    to: status as SubmissionStatus,
    note: status === "failed" ? errorMessage : undefined,
  };
  const history = [...(submission.history ?? []), historyEntry];

  const payload: Record<string, unknown> = {
    status,
    completed_at: nowIso,
    notified_at: nowIso,
    processing_started_at: submission.processing_started_at || processingStartedAtInput || nowIso,
    ai_agent_job_id: aiAgentJobId || submission.ai_agent_job_id || "",
    history,
  };
  if (status === "completed") {
    payload.result_file = resultFile;
    payload.result_file_size = resultFile instanceof File ? resultFile.size : 0;
    // Nombre REAL del archivo (antes de que PocketBase lo mangle con un
    // sufijo aleatorio al guardarlo) -- necesario para adjuntarlo con su
    // nombre correcto en el email de resultado (lib/mailer.ts::
    // sendResultEmailWithAttachments).
    payload.result_file_name = resultFile instanceof File ? resultFile.name : "";
    // Limpia un `error` colgado de un intento anterior (ej. la submission
    // se reseteó a mano a "processing" para reintentar) -- un cierre
    // exitoso no debería dejar visible el error de un intento previo.
    payload.error = "";
  } else {
    payload.error = errorMessage;
    // Mismo criterio a la inversa: si un intento anterior había llegado a
    // completarse y se resetea para reintentar, un cierre fallido no debe
    // dejar un result_file/tamaño/nombre de un resultado que ya no es válido.
    payload.result_file = "";
    payload.result_file_size = 0;
    payload.result_file_name = "";
  }

  let written: SubmissionRecord;
  try {
    // Una sola escritura con todos los campos juntos (§13): evita estados
    // intermedios donde el archivo subió pero el status quedó sin aplicar.
    written = (await pb
      .collection("submissions")
      .update(submission.id, payload)) as unknown as SubmissionRecord;
  } catch (e) {
    const pbStatus = e instanceof ClientResponseError ? e.status : 0;
    console.error("[webhooks/processing-result] error escribiendo submission:", e);
    if (pbStatus >= 400 && pbStatus < 500) {
      return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "write failed" }, { status: 500 });
  }

  // Guard post-escritura: el SDK de PocketBase no soporta un update
  // condicionado por filtro/versión (no hay "UPDATE...WHERE" a nivel de
  // RecordService, confirmado contra el código fuente del backend -- los
  // superusuarios bypasean por completo `updateRule`), así que no existe un
  // compare-and-swap nativo disponible sin re-modelar el auth del webhook.
  // Como mitigación real: se compara el `history` recién escrito contra el
  // que nosotros enviamos. Si otro writer (otro callback casi simultáneo, o
  // el cron mark-stale) alcanzó a insertar una entrada entre nuestra
  // relectura y nuestra escritura, el array persistido en DB va a diferir
  // del que mandamos (por el entry ajeno) y lo tratamos como derrota
  // explícita: no disparamos notificación duplicada.
  const wonRace = (written.history?.length ?? 0) === history.length;
  if (!wonRace) {
    console.error(
      "[webhooks/processing-result] posible escritura concurrente detectada tras update:",
      submission.id,
    );
    return NextResponse.json(
      { ok: false, error: "conflicting concurrent write" },
      { status: 409 },
    );
  }

  // El estado ya se escribió correctamente en PocketBase -- eso es lo que
  // importa para el orchestrator, y lo único que debe bloquear la respuesta
  // HTTP. notifySubmissionResult() (en especial el email con adjuntos:
  // baja 3 archivos de PocketBase + los sube al orchestrator + espera el
  // envío SMTP real) puede tardar más que el timeout default de la función
  // serverless -- si se hiciera de forma síncrona antes de responder, un
  // resultado con archivos grandes corre el riesgo real de que Vercel mate
  // la función a mitad de camino, sin loguear nada (confirmado: pasó con
  // una submission real de ~330KB combinados, jul-2026 -- con archivos de
  // prueba de ~1.5KB nunca se manifestó). Por eso se dispara en segundo
  // plano con after(): la respuesta ya salió, y el runtime de Vercel
  // mantiene la función viva el tiempo que haga falta para completarlo.
  after(async () => {
    try {
      await notifySubmissionResult(
        pb,
        { ...submission, ...payload, id: submission.id } as SubmissionRecord,
        status === "completed" ? "submission_completed" : "submission_failed",
      );
    } catch (e) {
      console.error("[webhooks/processing-result] error notificando resultado:", e);
    }
  });

  return NextResponse.json({
    ok: true,
    submission_id: submission.id,
    already_processed: false,
  });
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
