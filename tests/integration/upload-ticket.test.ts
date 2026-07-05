import { beforeEach, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";

vi.mock("@/lib/pocketbase/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pocketbase/server")>();
  return { ...actual, getServerPb: vi.fn() };
});

const { getServerPb } = await import("@/lib/pocketbase/server");
const { POST } = await import("@/app/api/upload-ticket/route");

function fakePb(opts: { isValid: boolean; refreshError?: unknown; record?: { id: string; email: string } }) {
  const record = opts.record ?? { id: "user-1", email: "alice@example.com" };
  return {
    authStore: {
      isValid: opts.isValid,
      token: "pb-token-abc",
      record,
    },
    collection(name: string) {
      if (name !== "users") throw new Error(`unexpected collection ${name}`);
      return {
        async authRefresh() {
          if (opts.refreshError) throw opts.refreshError;
          return { record };
        },
      };
    },
  };
}

beforeEach(() => {
  vi.mocked(getServerPb).mockReset();
});

describe("POST /api/upload-ticket", () => {
  it("returns 401 'No autenticado' when there is no valid session", async () => {
    vi.mocked(getServerPb).mockResolvedValue(fakePb({ isValid: false }) as never);
    const res = await POST();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("No autenticado");
  });

  it("returns 401 'Sesión expirada' when authRefresh() fails", async () => {
    vi.mocked(getServerPb).mockResolvedValue(
      fakePb({ isValid: true, refreshError: new Error("expired") }) as never,
    );
    const res = await POST();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Sesión expirada");
  });

  it("issues a ticket bound to the session user and re-sets the auth cookie", async () => {
    vi.mocked(getServerPb).mockResolvedValue(
      fakePb({ isValid: true, record: { id: "user-42", email: "bob@example.com" } }) as never,
    );
    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.orchestratorUrl).toBe("https://fake-orchestrator.test");

    const secret = new TextEncoder().encode("test-upload-ticket-secret");
    const { payload } = await jwtVerify(json.ticket, secret);
    expect(payload.sub).toBe("user-42");
    expect(payload.email).toBe("bob@example.com");

    expect(res.headers.get("set-cookie")).toMatch(/pb_auth=/);
  });
});

describe("POST /api/upload-ticket — DEV_PREVIEW bypass", () => {
  it("issues a ticket for FAKE_USER without ever calling getServerPb", async () => {
    vi.resetModules();
    vi.doMock("@/lib/preview", () => ({
      DEV_PREVIEW: true,
      FAKE_USER: { id: "dev-user", email: "dev@local.test", name: "Dev" },
    }));
    const { getServerPb: mockedGetServerPb } = await import("@/lib/pocketbase/server");
    const { POST: previewPost } = await import("@/app/api/upload-ticket/route");

    const res = await previewPost();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.orchestratorUrl).toBe("https://fake-orchestrator.test");
    const secret = new TextEncoder().encode("test-upload-ticket-secret");
    const { payload } = await jwtVerify(json.ticket, secret);
    expect(payload.sub).toBe("dev-user");
    expect(mockedGetServerPb).not.toHaveBeenCalled();

    vi.doUnmock("@/lib/preview");
    vi.resetModules();
  });
});
