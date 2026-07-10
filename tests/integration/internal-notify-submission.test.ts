import { beforeEach, describe, expect, it, vi } from "vitest";
import { baseSubmission, makeFakeAdminPb } from "../helpers/fake-pocketbase";

// Debe coincidir con vitest.config.ts test.env.RESULT_WEBHOOK_SECRET --
// este endpoint reusa el mismo secreto que el hop orchestrator->Next.js
// (ver docstring de la ruta) en vez de uno dedicado.
const SECRET = "test-result-webhook-secret";

vi.mock("@/lib/pocketbase/admin", () => ({
  getAdminPb: vi.fn(),
}));

vi.mock("@/lib/notify", () => ({
  notifySubmissionResult: vi.fn(),
}));

// after() exige un request scope real -- ver mismo mock en
// webhook-processing-result.test.ts.
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
const { notifySubmissionResult } = await import("@/lib/notify");
const { POST } = await import("@/app/api/internal/notify-submission/route");

async function callPost(body: unknown, headers: Record<string, string> = {}) {
  capturedAfter = null;
  const req = new NextRequest("http://localhost/api/internal/notify-submission", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
  const res = await POST(req);
  if (capturedAfter) await capturedAfter;
  return res;
}

beforeEach(() => {
  vi.mocked(getAdminPb).mockReset();
  vi.mocked(notifySubmissionResult).mockReset();
});

describe("POST /api/internal/notify-submission — auth", () => {
  it("rejects without X-Internal-Secret", async () => {
    const res = await callPost({ submissionId: "sub-1", notificationType: "submission_completed" });
    expect(res.status).toBe(401);
  });

  it("rejects with a wrong secret", async () => {
    const res = await callPost(
      { submissionId: "sub-1", notificationType: "submission_completed" },
      { "X-Internal-Secret": "wrong" },
    );
    expect(res.status).toBe(401);
    expect(notifySubmissionResult).not.toHaveBeenCalled();
  });
});

describe("POST /api/internal/notify-submission — validación (400s)", () => {
  it("rejects a missing submissionId", async () => {
    const res = await callPost(
      { notificationType: "submission_completed" },
      { "X-Internal-Secret": SECRET },
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid notificationType", async () => {
    const res = await callPost(
      { submissionId: "sub-1", notificationType: "not_a_real_type" },
      { "X-Internal-Secret": SECRET },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/internal/notify-submission — happy path", () => {
  it("returns 404 when the submission doesn't exist", async () => {
    const { pb } = makeFakeAdminPb({ submissions: [] });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    const res = await callPost(
      { submissionId: "sub-ghost", notificationType: "submission_completed" },
      { "X-Internal-Secret": SECRET },
    );
    expect(res.status).toBe(404);
    expect(notifySubmissionResult).not.toHaveBeenCalled();
  });

  it("re-lee la submission fresca y delega a notifySubmissionResult() con el tipo pedido", async () => {
    const submission = baseSubmission({ id: "sub-1", status: "completed" });
    const { pb } = makeFakeAdminPb({ submissions: [submission] });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    const res = await callPost(
      { submissionId: "sub-1", notificationType: "submission_completed" },
      { "X-Internal-Secret": SECRET },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, submission_id: "sub-1" });
    expect(notifySubmissionResult).toHaveBeenCalledTimes(1);
    expect(notifySubmissionResult).toHaveBeenCalledWith(pb, submission, "submission_completed");
  });

  it("nunca tira: un fallo dentro de notifySubmissionResult() no rompe la respuesta ya enviada", async () => {
    const submission = baseSubmission({ id: "sub-1" });
    const { pb } = makeFakeAdminPb({ submissions: [submission] });
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);
    vi.mocked(notifySubmissionResult).mockRejectedValue(new Error("smtp down"));

    const res = await callPost(
      { submissionId: "sub-1", notificationType: "submission_failed" },
      { "X-Internal-Secret": SECRET },
    );
    expect(res.status).toBe(200);
  });
});
