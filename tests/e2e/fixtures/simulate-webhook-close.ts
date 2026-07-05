import { createHmac } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import * as XLSX from "xlsx";

/** PocketBase valida el `result_file` contra los mimeTypes del schema
 * (xlsx/xls) por contenido real, no solo por el Content-Type declarado en
 * el multipart -- bytes arbitrarios con un nombre .xlsx son rechazados
 * (400 "Failed to update record"). Génera un .xlsx mínimo pero real. */
function buildFakeResultXlsx(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["resultado"], ["simulado E2E"]]);
  XLSX.utils.book_append_sheet(wb, ws, "Resultado");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

// Reimplementación mínima de lib/webhooks/hmac.ts:signResultWebhook -- no se
// importa el original porque tiene `import "server-only"` (pensado para
// correr dentro de Next.js, no en el proceso Node de Playwright).
function signResultWebhook(secret: string, requestId: string, status: string, timestamp: number): string {
  const canonical = `${requestId}.${status}.${timestamp}`;
  const digest = createHmac("sha256", secret).update(canonical).digest("hex");
  return `sha256=${digest}`;
}

/**
 * Simula el hop 2 (orchestrator -> Next.js) del webhook de cierre,
 * llamando directo a la app local con una firma HMAC válida -- así los
 * tests E2E pueden verificar que la UI (polling en historial/detalle)
 * refleja el cierre real sin depender de un AI Excel Agent externo de
 * verdad ni del orchestrator del droplet.
 */
export async function simulateWebhookClose(
  request: APIRequestContext,
  opts: {
    requestId: string;
    status: "completed" | "failed";
    errorMessage?: string;
    resultFileName?: string;
  },
) {
  const secret = process.env.RESULT_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("simulateWebhookClose: falta RESULT_WEBHOOK_SECRET en el entorno");
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signResultWebhook(secret, opts.requestId, opts.status, timestamp);

  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    request_id: opts.requestId,
    status: opts.status,
  };
  if (opts.status === "failed") {
    multipart.error_message = opts.errorMessage ?? "Error simulado en el test E2E";
  } else {
    multipart.result_file = {
      name: opts.resultFileName ?? "resultado.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: buildFakeResultXlsx(),
    };
  }

  return request.post("/api/webhooks/processing-result", {
    multipart,
    headers: {
      "x-webhook-timestamp": String(timestamp),
      "x-webhook-signature": signature,
    },
  });
}
