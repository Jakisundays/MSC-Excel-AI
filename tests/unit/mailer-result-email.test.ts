import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionRecord } from "@/lib/pocketbase/types";
import { baseSubmission } from "../helpers/fake-pocketbase";

// env.ts calcula `env` a nivel de módulo desde process.env -- mockearlo
// directo es más simple/explícito que depender de vi.stubEnv (que no
// afecta valores ya leídos en un `env` importado antes del stub).
vi.mock("@/lib/env", () => ({
  env: {
    ORCHESTRATOR_URL: "https://fake-orchestrator.test",
    INVITATION_EMAIL_SECRET: "test-invitation-secret",
  },
}));

vi.mock("@/lib/pocketbase/admin", () => ({
  getAdminPb: vi.fn(),
}));

const { getAdminPb } = await import("@/lib/pocketbase/admin");
const { sendResultEmailWithAttachments } = await import("@/lib/mailer");

function fakePb(record: SubmissionRecord) {
  // getOne memoizado (no uno nuevo por llamada a .collection()): así un
  // spy tomado sobre `pb.collection("submissions").getOne` desde el test
  // sigue siendo el MISMO mock que invoca sendResultEmailWithAttachments()
  // por dentro -- de lo contrario cada `.collection()` devolvería un
  // objeto/mock distinto y el spy nunca vería la llamada real.
  const submissionsCollection = { getOne: vi.fn().mockResolvedValue(record) };
  return {
    collection(name: string) {
      if (name !== "submissions") {
        throw new Error(`fake pb: colección no soportada: ${name}`);
      }
      return submissionsCollection;
    },
    files: {
      getURL(_record: unknown, filename: string) {
        return `https://fake-pb.test/files/${filename}`;
      },
    },
  };
}

function completedSubmission(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return baseSubmission({
    status: "completed",
    reply_to: ["destinatario@empresa.com"],
    original_file_a: "orig_a_abc123.xlsx",
    original_file_b: "orig_b_def456.xlsx",
    file_a_name: "Cartera marzo.xlsx",
    file_b_name: "Siniestros Q1.xlsx",
    result_file: "resultado_xyz789.xlsx",
    result_file_name: "Resultado.xlsx",
    ...overrides,
  });
}

function findCall(fetchMock: ReturnType<typeof vi.fn>, urlSubstring: string) {
  return fetchMock.mock.calls.find((call: unknown[]) => (call[0] as string).includes(urlSubstring));
}

describe("sendResultEmailWithAttachments", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(getAdminPb).mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes("fake-orchestrator.test")) {
        return new Response(
          JSON.stringify({
            ok: true,
            attached: { original_1: true, original_2: true, result_file: true },
          }),
          { status: 200 },
        );
      }
      // Descarga de un archivo desde PocketBase.
      return new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
  });

  it("returns ok:false without attempting anything when `to` is empty", async () => {
    const result = await sendResultEmailWithAttachments({
      to: [],
      subject: "s",
      bodyHtml: "<p>h</p>",
      submission: completedSubmission(),
    });

    expect(result).toEqual({ ok: false });
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(getAdminPb).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ok:false without attempting anything when result_file is empty", async () => {
    const result = await sendResultEmailWithAttachments({
      to: ["a@empresa.com"],
      subject: "s",
      bodyHtml: "<p>h</p>",
      submission: completedSubmission({ result_file: "" }),
    });

    expect(result).toEqual({ ok: false });
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(getAdminPb).not.toHaveBeenCalled();
  });

  it("posts to the orchestrator with the 3 attachments, their real filenames, in order", async () => {
    const submission = completedSubmission();
    vi.mocked(getAdminPb).mockResolvedValue(fakePb(submission) as never);

    const result = await sendResultEmailWithAttachments({
      to: ["uno@empresa.com", "dos@empresa.com"],
      subject: "Tu solicitud está lista",
      bodyHtml: "<p>Listo</p>",
      submission,
    });

    expect(result).toEqual({
      ok: true,
      attached: { original_1: true, original_2: true, result_file: true },
    });

    const call = findCall(fetchMock, "/send-result-email");
    expect(call).toBeTruthy();
    const [url, init] = call!;
    expect(url).toBe("https://fake-orchestrator.test/send-result-email");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Api-Key"]).toBe("test-invitation-secret");

    const form = init.body as FormData;
    expect(form.getAll("to")).toEqual(["uno@empresa.com", "dos@empresa.com"]);
    expect(form.get("subject")).toBe("Tu solicitud está lista");
    expect(form.get("body_html")).toBe("<p>Listo</p>");

    const original1 = form.get("original_1") as File;
    const original2 = form.get("original_2") as File;
    const resultFile = form.get("result_file") as File;
    expect(original1.name).toBe("Cartera marzo.xlsx");
    expect(original2.name).toBe("Siniestros Q1.xlsx");
    expect(resultFile.name).toBe("Resultado.xlsx");

    // Orden de inserción en el FormData: original_1, original_2, result_file.
    const keys = [...form.keys()];
    expect(keys.indexOf("original_1")).toBeLessThan(keys.indexOf("original_2"));
    expect(keys.indexOf("original_2")).toBeLessThan(keys.indexOf("result_file"));
  });

  it("re-fetches the full record via getOne() before asking for file URLs", async () => {
    const submission = completedSubmission({ id: "sub-42" });
    const pb = fakePb(submission);
    const getOneSpy = vi.spyOn(pb.collection("submissions"), "getOne");
    vi.mocked(getAdminPb).mockResolvedValue(pb as never);

    await sendResultEmailWithAttachments({
      to: ["a@empresa.com"],
      subject: "s",
      bodyHtml: "<p>h</p>",
      submission,
    });

    // Confirma que la función SÍ relee el record completo vía getOne() en
    // vez de usar el `submission` parcial recibido como parámetro.
    expect(getOneSpy).toHaveBeenCalled();
  });

  it("omits original_1/original_2 in the form when the submission has no original files", async () => {
    const submission = completedSubmission({ original_file_a: "", original_file_b: "" });
    vi.mocked(getAdminPb).mockResolvedValue(fakePb(submission) as never);

    const result = await sendResultEmailWithAttachments({
      to: ["a@empresa.com"],
      subject: "s",
      bodyHtml: "<p>h</p>",
      submission,
    });

    expect(result.ok).toBe(true);
    const [, init] = findCall(fetchMock, "/send-result-email")!;
    const form = init.body as FormData;
    expect(form.get("original_1")).toBeNull();
    expect(form.get("original_2")).toBeNull();
    expect(form.get("result_file")).toBeTruthy();
  });

  it("falls back to 'Resultado.xlsx' when result_file_name is empty (pre-migration submissions)", async () => {
    const submission = completedSubmission({ result_file_name: "" });
    vi.mocked(getAdminPb).mockResolvedValue(fakePb(submission) as never);

    await sendResultEmailWithAttachments({
      to: ["a@empresa.com"],
      subject: "s",
      bodyHtml: "<p>h</p>",
      submission,
    });

    const [, init] = findCall(fetchMock, "/send-result-email")!;
    const form = init.body as FormData;
    const resultFile = form.get("result_file") as File;
    expect(resultFile.name).toBe("Resultado.xlsx");
  });

  it("returns ok:false when downloading result_file from PocketBase fails", async () => {
    const submission = completedSubmission();
    vi.mocked(getAdminPb).mockResolvedValue(fakePb(submission) as never);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("resultado_xyz789.xlsx")) {
        return new Response("not found", { status: 404 });
      }
      if (url.includes("fake-orchestrator.test")) {
        return new Response(JSON.stringify({ ok: true, attached: {} }), { status: 200 });
      }
      return new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 });
    });

    const result = await sendResultEmailWithAttachments({
      to: ["a@empresa.com"],
      subject: "s",
      bodyHtml: "<p>h</p>",
      submission,
    });

    expect(result).toEqual({ ok: false });
    expect(findCall(fetchMock, "/send-result-email")).toBeUndefined();
  });

  it("returns ok:false when the orchestrator responds non-2xx", async () => {
    const submission = completedSubmission();
    vi.mocked(getAdminPb).mockResolvedValue(fakePb(submission) as never);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("fake-orchestrator.test")) {
        return new Response("boom", { status: 502 });
      }
      return new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 });
    });

    const result = await sendResultEmailWithAttachments({
      to: ["a@empresa.com"],
      subject: "s",
      bodyHtml: "<p>h</p>",
      submission,
    });

    expect(result).toEqual({ ok: false });
  });

  it("propagates {ok:false, attached} from the orchestrator when it degraded but still responded 200", async () => {
    const submission = completedSubmission();
    vi.mocked(getAdminPb).mockResolvedValue(fakePb(submission) as never);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("fake-orchestrator.test")) {
        return new Response(
          JSON.stringify({
            ok: true,
            attached: { original_1: false, original_2: false, result_file: true },
          }),
          { status: 200 },
        );
      }
      return new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 });
    });

    const result = await sendResultEmailWithAttachments({
      to: ["a@empresa.com"],
      subject: "s",
      bodyHtml: "<p>h</p>",
      submission,
    });

    expect(result).toEqual({
      ok: true,
      attached: { original_1: false, original_2: false, result_file: true },
    });
  });

  it("never throws: returns ok:false when getAdminPb rejects", async () => {
    vi.mocked(getAdminPb).mockRejectedValue(new Error("pocketbase down"));

    const result = await sendResultEmailWithAttachments({
      to: ["a@empresa.com"],
      subject: "s",
      bodyHtml: "<p>h</p>",
      submission: completedSubmission(),
    });

    expect(result).toEqual({ ok: false });
  });
});
