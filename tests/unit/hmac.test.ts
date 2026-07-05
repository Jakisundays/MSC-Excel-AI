import { describe, expect, it } from "vitest";
import { signResultWebhook, verifyResultWebhookSignature } from "@/lib/webhooks/hmac";

const SECRET = "test-secret";

describe("signResultWebhook / verifyResultWebhookSignature", () => {
  it("accepts a correctly signed, fresh request", () => {
    const timestamp = 1_700_000_000;
    const signature = signResultWebhook(SECRET, {
      requestId: "req-1",
      status: "completed",
      timestamp,
    });
    const result = verifyResultWebhookSignature({
      secret: SECRET,
      requestId: "req-1",
      status: "completed",
      timestampHeader: String(timestamp),
      signatureHeader: signature,
      nowSeconds: timestamp,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects when signature headers are missing", () => {
    const result = verifyResultWebhookSignature({
      secret: SECRET,
      requestId: "req-1",
      status: "completed",
      timestampHeader: null,
      signatureHeader: null,
      nowSeconds: 1_700_000_000,
    });
    expect(result).toEqual({ valid: false, reason: "missing signature headers" });
  });

  it("rejects a non-numeric timestamp header", () => {
    const result = verifyResultWebhookSignature({
      secret: SECRET,
      requestId: "req-1",
      status: "completed",
      timestampHeader: "not-a-number",
      signatureHeader: "sha256=deadbeef",
      nowSeconds: 1_700_000_000,
    });
    expect(result).toEqual({ valid: false, reason: "invalid timestamp" });
  });

  it("accepts exactly at the 300s freshness boundary (past)", () => {
    const timestamp = 1_700_000_000;
    const signature = signResultWebhook(SECRET, { requestId: "req-1", status: "completed", timestamp });
    const result = verifyResultWebhookSignature({
      secret: SECRET,
      requestId: "req-1",
      status: "completed",
      timestampHeader: String(timestamp),
      signatureHeader: signature,
      nowSeconds: timestamp + 300,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects at 301s past the freshness boundary", () => {
    const timestamp = 1_700_000_000;
    const signature = signResultWebhook(SECRET, { requestId: "req-1", status: "completed", timestamp });
    const result = verifyResultWebhookSignature({
      secret: SECRET,
      requestId: "req-1",
      status: "completed",
      timestampHeader: String(timestamp),
      signatureHeader: signature,
      nowSeconds: timestamp + 301,
    });
    expect(result).toEqual({ valid: false, reason: "stale timestamp" });
  });

  it("rejects a timestamp 301s in the future", () => {
    const timestamp = 1_700_000_301;
    const signature = signResultWebhook(SECRET, { requestId: "req-1", status: "completed", timestamp });
    const result = verifyResultWebhookSignature({
      secret: SECRET,
      requestId: "req-1",
      status: "completed",
      timestampHeader: String(timestamp),
      signatureHeader: signature,
      nowSeconds: 1_700_000_000,
    });
    expect(result).toEqual({ valid: false, reason: "stale timestamp" });
  });

  it("rejects a tampered signature (wrong secret)", () => {
    const timestamp = 1_700_000_000;
    const signature = signResultWebhook("wrong-secret", {
      requestId: "req-1",
      status: "completed",
      timestamp,
    });
    const result = verifyResultWebhookSignature({
      secret: SECRET,
      requestId: "req-1",
      status: "completed",
      timestampHeader: String(timestamp),
      signatureHeader: signature,
      nowSeconds: timestamp,
    });
    expect(result).toEqual({ valid: false, reason: "invalid signature" });
  });

  it("rejects a signature computed for a different status (binds the canonical string)", () => {
    const timestamp = 1_700_000_000;
    const signature = signResultWebhook(SECRET, { requestId: "req-1", status: "failed", timestamp });
    const result = verifyResultWebhookSignature({
      secret: SECRET,
      requestId: "req-1",
      status: "completed", // distinto al firmado
      timestampHeader: String(timestamp),
      signatureHeader: signature,
      nowSeconds: timestamp,
    });
    expect(result).toEqual({ valid: false, reason: "invalid signature" });
  });

  it("does not throw when the signature header has a different length than expected", () => {
    // Regresión: timingSafeEqual lanza si los buffers difieren en longitud;
    // el código debe chequear length antes de llamarlo.
    const result = verifyResultWebhookSignature({
      secret: SECRET,
      requestId: "req-1",
      status: "completed",
      timestampHeader: "1700000000",
      signatureHeader: "short",
      nowSeconds: 1_700_000_000,
    });
    expect(result).toEqual({ valid: false, reason: "invalid signature" });
  });
});
