import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest as NextRequestType } from "next/server";
import { signResultWebhook } from "@/lib/webhooks/hmac";
import { ClientResponseError } from "pocketbase";
import { baseSubmission, makeFakeAdminPb } from "../helpers/fake-pocketbase";

// Debe coincidir con vitest.config.ts test.env.RESULT_WEBHOOK_SECRET.
const SECRET = "test-result-webhook-secret";

vi.mock("@/lib/pocketbase/admin", () => ({
  getAdminPb: vi.fn(),
}));

// after() (Next.js 15) exige un request scope real que no existe al invocar
// el handler directo en un test -- se mockea preservando NextRequest/
// NextResponse reales, capturando la promesa del callback para poder
// esperarla explícitamente (ver callPost() más abajo) y que las
// aserciones sobre efectos de notifySubmissionResult() sigan siendo
// determinísticas.
let capturedAfter: Promise<unknown> | null = null;
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => unknown) => {
      capturedAfter = Promise.resolve(fn());
    },
  };
});

const { NextRequest } = await import("next/server");
const { getAdminPb } = await import("@/lib/pocketbase/admin");
const { POST } = await import("@/app/api/webhooks/processing-result/route");

/** Invoca POST y espera cualquier trabajo en segundo plano registrado vía
 * after() antes de devolver el control -- ver mock de next/server arriba. */
async function callPost(request: NextRequestType) {
  capturedAfter = null;
  const res = await POST(request);
  if (capturedAfter) await capturedAfter;
  return res;
}

function signedHeaders(
  requestId: string,
  status: string,
  timestamp = Math.floor(Date.now() / 1000),
): Record<string, string> {
  return {
    "x-webhook-timestamp": String(timestamp),
    "x-webhook-signature": signResultWebhook(SECRET, { requestId, status, timestamp }),
  };
}

function makeRequest(form: FormData, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/webhooks/processing-result", {
    method: "POST",
    body: form,
    headers,
  });
}

function completedForm(requestId: string, fileBytes = [1, 2, 3]) {
  const form = new FormData();
  form.set("request_id", requestId);
  form.set("status", "completed");
  form.set(
    "result_file",
    new File([new Uint8Array(fileBytes)], "resultado.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  return form;
}

function failedForm(requestId: string, errorMessage = "boom") {
  const form = new FormData();
  form.set("request_id", requestId);
  form.set("status", "failed");
  form.set("error_message", errorMessage);
  return form;
}

beforeEach(() => {
  vi.mocked(getAdminPb).mockReset();
});

describe("POST /api/webhooks/processing-result — happy paths", () => {
  it("writes completed status + result_file on a valid signed callback", async () => {
    const { pb, updateCalls } = makeFakeAdminPb({
      submissions: [
        baseSubmission({ id: "sub-1", orchestrator_request_id: "req-1", status: "processing" }),
      ],
    });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    const res = await callPost(makeRequest(completedForm("req-1"), signedHeaders("req-1", "completed")));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, submission_id: "sub-1", already_processed: false });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].id).toBe("sub-1");
    expect(updateCalls[0].payload.status).toBe("completed");
    expect(updateCalls[0].payload.result_file_size).toBe(3);
  });

  it("writes failed status + error on a valid signed callback", async () => {
    const { pb, updateCalls } = makeFakeAdminPb({
      submissions: [
        baseSubmission({ id: "sub-2", orchestrator_request_id: "req-2", status: "processing" }),
      ],
    });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    const res = await callPost(
      makeRequest(failedForm("req-2", "el proveedor no pudo procesar"), signedHeaders("req-2", "failed")),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updateCalls[0].payload.status).toBe("failed");
    expect(updateCalls[0].payload.error).toBe("el proveedor no pudo procesar");
  });

  it("clears a stale error message when the new terminal status is completed", async () => {
    // Submission llegó a "processing" con un `error` viejo colgado de un
    // intento anterior (p. ej. reseteada a mano en PocketBase para
    // reintentar) -- un cierre exitoso no debería dejar ese error visible.
    const { pb, updateCalls } = makeFakeAdminPb({
      submissions: [
        baseSubmission({
          id: "sub-stale-1",
          orchestrator_request_id: "req-stale-1",
          status: "processing",
          error: "intento anterior fallido",
        }),
      ],
    });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    await callPost(makeRequest(completedForm("req-stale-1"), signedHeaders("req-stale-1", "completed")));

    expect(updateCalls[0].payload.error).toBe("");
  });

  it("clears a stale result_file when the new terminal status is failed", async () => {
    const { pb, updateCalls } = makeFakeAdminPb({
      submissions: [
        baseSubmission({
          id: "sub-stale-2",
          orchestrator_request_id: "req-stale-2",
          status: "processing",
          result_file: "old-result.xlsx",
          result_file_size: 999,
        }),
      ],
    });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    await callPost(makeRequest(failedForm("req-stale-2", "nuevo error"), signedHeaders("req-stale-2", "failed")));

    expect(updateCalls[0].payload.result_file).toBe("");
    expect(updateCalls[0].payload.result_file_size).toBe(0);
  });

  it("preserves an existing processing_started_at instead of overwriting it", async () => {
    const { pb, updateCalls } = makeFakeAdminPb({
      submissions: [
        baseSubmission({
          id: "sub-3",
          orchestrator_request_id: "req-3",
          status: "processing",
          processing_started_at: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    await callPost(makeRequest(completedForm("req-3"), signedHeaders("req-3", "completed")));

    expect(updateCalls[0].payload.processing_started_at).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("POST /api/webhooks/processing-result — payload validation (400s)", () => {
  it("rejects a request with no request_id", async () => {
    const form = new FormData();
    form.set("status", "completed");
    const res = await callPost(makeRequest(form));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing request_id");
  });

  it("rejects an invalid status enum value", async () => {
    const form = new FormData();
    form.set("request_id", "req-1");
    form.set("status", "done");
    const res = await callPost(makeRequest(form));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid status");
  });

  it("rejects status=completed without a result_file", async () => {
    const form = new FormData();
    form.set("request_id", "req-1");
    form.set("status", "completed");
    const res = await callPost(makeRequest(form));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("result_file is required when status=completed");
  });

  it("rejects status=failed without an error_message", async () => {
    const form = new FormData();
    form.set("request_id", "req-1");
    form.set("status", "failed");
    const res = await callPost(makeRequest(form));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("error_message is required when status=failed");
  });

  it("rejects a malformed (non-multipart) body", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/processing-result", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=broken" },
      body: "this is not a valid multipart body",
    });
    const res = await callPost(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid multipart body");
  });
});

describe("POST /api/webhooks/processing-result — signature verification (401s)", () => {
  it("rejects a request with no signature headers at all", async () => {
    const res = await callPost(makeRequest(completedForm("req-1")));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid signature");
  });

  it("rejects a tampered signature", async () => {
    const res = await callPost(
      makeRequest(completedForm("req-1"), {
        "x-webhook-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-webhook-signature": "sha256=deadbeef",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a stale timestamp (301s old)", async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 301;
    const signature = signResultWebhook(SECRET, { requestId: "req-1", status: "completed", timestamp });
    const res = await callPost(
      makeRequest(completedForm("req-1"), {
        "x-webhook-timestamp": String(timestamp),
        "x-webhook-signature": signature,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("never reaches PocketBase when the signature is invalid", async () => {
    const { pb } = makeFakeAdminPb();
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);
    await callPost(makeRequest(completedForm("req-1"))); // sin headers de firma
    expect(getAdminPb).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/processing-result — idempotency & conflicts", () => {
  it("returns 404 unknown request_id when no submission matches", async () => {
    const { pb } = makeFakeAdminPb({ submissions: [] });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    const res = await callPost(makeRequest(completedForm("req-ghost"), signedHeaders("req-ghost", "completed")));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("unknown request_id");
  });

  it("returns 500 lookup failed on a non-404 PocketBase error during lookup", async () => {
    const { pb } = makeFakeAdminPb({
      lookupError: new ClientResponseError({ status: 503, response: { message: "db down" } }),
    });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    const res = await callPost(makeRequest(completedForm("req-1"), signedHeaders("req-1", "completed")));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("lookup failed");
  });

  it("is idempotent: a duplicate callback with the same terminal status does not write again", async () => {
    const { pb, updateCalls } = makeFakeAdminPb({
      submissions: [
        baseSubmission({ id: "sub-4", orchestrator_request_id: "req-4", status: "completed" }),
      ],
    });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    const res = await callPost(makeRequest(completedForm("req-4"), signedHeaders("req-4", "completed")));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.already_processed).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it("returns 409 conflicting terminal state when the reported status differs from the stored terminal status", async () => {
    const { pb, updateCalls } = makeFakeAdminPb({
      submissions: [
        baseSubmission({ id: "sub-5", orchestrator_request_id: "req-5", status: "completed" }),
      ],
    });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    const res = await callPost(makeRequest(failedForm("req-5"), signedHeaders("req-5", "failed")));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("conflicting terminal state");
    expect(updateCalls).toHaveLength(0);
  });
});

describe("POST /api/webhooks/processing-result — PocketBase write failures", () => {
  it("returns 400 invalid payload on a 4xx write error from PocketBase", async () => {
    const { pb } = makeFakeAdminPb({
      submissions: [
        baseSubmission({ id: "sub-6", orchestrator_request_id: "req-6", status: "processing" }),
      ],
      updateError: new ClientResponseError({ status: 400, response: { message: "bad field" } }),
    });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    const res = await callPost(makeRequest(completedForm("req-6"), signedHeaders("req-6", "completed")));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid payload");
  });

  it("returns 500 write failed on an unexpected write error", async () => {
    const { pb } = makeFakeAdminPb({
      submissions: [
        baseSubmission({ id: "sub-7", orchestrator_request_id: "req-7", status: "processing" }),
      ],
      updateError: new Error("connection reset"),
    });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    const res = await callPost(makeRequest(completedForm("req-7"), signedHeaders("req-7", "completed")));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("write failed");
  });
});

describe("POST /api/webhooks/processing-result — DEV_PREVIEW bypass", () => {
  it("short-circuits and never touches PocketBase when DEV_PREVIEW is true", async () => {
    vi.resetModules();
    vi.doMock("@/lib/preview", () => ({ DEV_PREVIEW: true, FAKE_USER: { id: "dev-user", email: "dev@local.test" } }));
    const { getAdminPb: mockedGetAdminPb } = await import("@/lib/pocketbase/admin");
    const { POST: previewPost } = await import("@/app/api/webhooks/processing-result/route");

    const res = await previewPost(makeRequest(new FormData()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, submission_id: "dev", already_processed: false });
    expect(mockedGetAdminPb).not.toHaveBeenCalled();

    vi.doUnmock("@/lib/preview");
    vi.resetModules();
  });
});
