import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ClientResponseError } from "pocketbase";
import { makeFakeUsersAdminPb } from "../helpers/fake-pocketbase";

vi.mock("@/lib/pocketbase/admin", () => ({ getAdminPb: vi.fn() }));

const { getAdminPb } = await import("@/lib/pocketbase/admin");
const { POST } = await import("@/app/api/auth/register/route");

// PASSWORD_MIN_LENGTH = 10 y exige letra + dígito (ver lib/validators.ts).
// Password fijo válido para los casos que no testean la política en sí.
const VALID_PASSWORD = "correcthorse1";

// NAME_MAX_LENGTH no se exporta desde app/api/auth/register/route.ts (es un
// const local, ver comentario ahí: "Mismo tope que companies.name"). Se fija
// aquí en 120 tras confirmar el valor exacto en el código.
const NAME_MAX_LENGTH = 120;

let ipCounter = 0;
/** Cada llamada devuelve una IP nueva. checkRateLimit() (lib/rate-limit.ts)
 * guarda sus contadores en un Map module-level compartido por TODO el
 * proceso de test (no hay mock ni reset entre tests) -- sin IPs distintas,
 * varios tests reusando la misma IP terminarían disparando un 429 espurio
 * sobre casos que no están probando rate limiting. */
function freshIp(): string {
  return `10.0.0.${++ipCounter}`;
}

function makeRequest(body: unknown, ip: string = freshIp()): NextRequest {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Alice",
    email: "alice@example.com",
    password: VALID_PASSWORD,
    passwordConfirm: VALID_PASSWORD,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getAdminPb).mockReset();
});

describe("POST /api/auth/register — rate limiting", () => {
  it("returns 429 rate_limited after 5 requests from the same IP within the window", async () => {
    const fake = makeFakeUsersAdminPb({
      createdId: "user-rl-1",
      impersonatedToken: "pb-session-token",
    });
    vi.mocked(getAdminPb).mockResolvedValue(fake.pb as never);

    const ip = freshIp();
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest(validBody({ email: `rl${i}@example.com` }), ip));
      expect(res.status).toBe(200);
    }

    const blocked = await POST(makeRequest(validBody({ email: "rl-blocked@example.com" }), ip));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "rate_limited" });
    // El chequeo de rate limit corre antes que nada -- la 6ta request ni
    // siquiera debería llegar al cliente admin.
    expect(fake.createCalls).toHaveLength(5);
  });
});

describe("POST /api/auth/register — validación de input (400 invalid_input)", () => {
  it.each([
    ["empty name", validBody({ name: "" })],
    ["name over NAME_MAX_LENGTH", validBody({ name: "a".repeat(NAME_MAX_LENGTH + 1) })],
    ["invalid email", validBody({ email: "not-an-email" })],
    ["weak password (too short)", validBody({ password: "short1", passwordConfirm: "short1" })],
    [
      "weak password (no digit)",
      validBody({ password: "onlylettersnodigits", passwordConfirm: "onlylettersnodigits" }),
    ],
  ])("rejects %s", async (_desc, body) => {
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
    expect(getAdminPb).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/register — password mismatch", () => {
  it("returns 400 invalid_input when password !== passwordConfirm", async () => {
    const res = await POST(
      makeRequest(validBody({ password: VALID_PASSWORD, passwordConfirm: VALID_PASSWORD + "x" })),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
    expect(getAdminPb).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/register — duplicate email (registration_failed)", () => {
  it("returns 400 registration_failed, indistinguishable from the generic invalid_input failure", async () => {
    // Simula lo que PocketBase devuelve cuando el email ya existe: un 4xx
    // de validación de schema en users.create().
    const dupError = new ClientResponseError({
      status: 400,
      response: {
        message: "Failed to create record.",
        data: { email: { code: "validation_not_unique", message: "Value must be unique." } },
      },
    });
    const fake = makeFakeUsersAdminPb({ createError: dupError });
    vi.mocked(getAdminPb).mockResolvedValue(fake.pb as never);

    const dupRes = await POST(makeRequest(validBody({ email: "ya-existe@example.com" })));
    const dupJson = await dupRes.json();

    expect(dupRes.status).toBe(400);
    expect(dupJson).toEqual({ error: "registration_failed" });

    // La propiedad de seguridad bajo prueba, explícitamente (ver comentario
    // en la ruta): esta respuesta de "email duplicado" debe ser
    // INDISTINGUIBLE -- mismo status, misma forma de body -- de un rechazo
    // de validación de input genérico. Si difiriera en shape (campos
    // extra, status distinto), un atacante podría enumerar emails
    // registrados comparando respuestas. No comparamos el string de
    // `error` (a propósito son códigos distintos: "registration_failed" vs
    // "invalid_input"), sino el status y el shape del body.
    const invalidRes = await POST(makeRequest(validBody({ name: "" })));
    const invalidJson = await invalidRes.json();

    expect(dupRes.status).toBe(invalidRes.status);
    expect(Object.keys(dupJson).sort()).toEqual(Object.keys(invalidJson).sort());
    expect(typeof dupJson.error).toBe("string");
    expect(typeof invalidJson.error).toBe("string");
  });
});

describe("POST /api/auth/register — success", () => {
  it("returns 200 with ok/name and sets the pb_auth session cookie", async () => {
    const fake = makeFakeUsersAdminPb({
      createdId: "user-new-1",
      impersonatedRecord: { id: "user-new-1", name: "Alice", email: "alice@example.com" },
      impersonatedToken: "pb-session-token-abc",
    });
    vi.mocked(getAdminPb).mockResolvedValue(fake.pb as never);

    const res = await POST(makeRequest(validBody({ name: "Alice", email: "alice@example.com" })));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.name).toBe("Alice");
    expect(res.headers.get("set-cookie")).toMatch(/pb_auth=/);

    expect(fake.createCalls).toHaveLength(1);
    expect(fake.createCalls[0]).toMatchObject({
      name: "Alice",
      email: "alice@example.com",
      password: VALID_PASSWORD,
      passwordConfirm: VALID_PASSWORD,
    });
    expect(fake.impersonateCalls).toEqual([{ id: "user-new-1", duration: 0 }]);
  });
});

describe("POST /api/auth/register — impersonate() failure", () => {
  it("returns 502 network when impersonate() throws, without rolling back the created account", async () => {
    const fake = makeFakeUsersAdminPb({
      createdId: "user-new-2",
      impersonateError: new Error("pocketbase down"),
    });
    vi.mocked(getAdminPb).mockResolvedValue(fake.pb as never);

    const res = await POST(makeRequest(validBody({ email: "bob@example.com" })));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "network" });
    // Best-effort: la cuenta no se revierte si falla solo la emisión de
    // sesión (ver comentario en la ruta) -- create() debe haberse llamado.
    expect(fake.createCalls).toHaveLength(1);
  });
});
