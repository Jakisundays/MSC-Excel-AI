import { NextRequest, NextResponse } from "next/server";
import { ClientResponseError } from "pocketbase";

import { getAdminPb } from "@/lib/pocketbase/admin";
import { verifyResultWebhookSignature } from "@/lib/webhooks/hmac";
import { env } from "@/lib/env";
import { DEV_PREVIEW } from "@/lib/preview";
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
    processing_started_at: submission.processing_started_at || processingStartedAtInput || nowIso,
    ai_agent_job_id: aiAgentJobId || submission.ai_agent_job_id || "",
    history,
  };
  if (status === "completed") {
    payload.result_file = resultFile;
    payload.result_file_size = resultFile instanceof File ? resultFile.size : 0;
  } else {
    payload.error = errorMessage;
  }

  try {
    // Una sola escritura con todos los campos juntos (§13): evita estados
    // intermedios donde el archivo subió pero el status quedó sin aplicar.
    await pb.collection("submissions").update(submission.id, payload);
  } catch (e) {
    const pbStatus = e instanceof ClientResponseError ? e.status : 0;
    console.error("[webhooks/processing-result] error escribiendo submission:", e);
    if (pbStatus >= 400 && pbStatus < 500) {
      return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "write failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    submission_id: submission.id,
    already_processed: false,
  });
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
