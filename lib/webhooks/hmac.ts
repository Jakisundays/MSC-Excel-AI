import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/** Ver plan §5: rechaza firmas con más de 5 min de diferencia (mitiga replay). */
const FRESHNESS_WINDOW_SECONDS = 5 * 60;

/**
 * Firma canónica del webhook de cierre: HMAC-SHA256 sobre los metadatos
 * (nunca sobre el archivo completo, para no bufferearlo dos veces).
 */
export function signResultWebhook(
  secret: string,
  params: { requestId: string; status: string; timestamp: number },
): string {
  const canonical = `${params.requestId}.${params.status}.${params.timestamp}`;
  const digest = createHmac("sha256", secret).update(canonical).digest("hex");
  return `sha256=${digest}`;
}

export type SignatureVerification =
  | { valid: true }
  | { valid: false; reason: string };

export function verifyResultWebhookSignature(params: {
  secret: string;
  requestId: string;
  status: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  nowSeconds: number;
}): SignatureVerification {
  const { secret, requestId, status, timestampHeader, signatureHeader, nowSeconds } =
    params;

  if (!timestampHeader || !signatureHeader) {
    return { valid: false, reason: "missing signature headers" };
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return { valid: false, reason: "invalid timestamp" };
  }
  if (Math.abs(nowSeconds - timestamp) > FRESHNESS_WINDOW_SECONDS) {
    return { valid: false, reason: "stale timestamp" };
  }

  const expected = signResultWebhook(secret, { requestId, status, timestamp });
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);

  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return { valid: false, reason: "invalid signature" };
  }

  return { valid: true };
}
