import { beforeEach, describe, expect, it, vi } from "vitest";
import PocketBase from "pocketbase";

vi.mock("@/lib/company", () => ({ listCompanyMembers: vi.fn() }));

const { listCompanyMembers } = await import("@/lib/company");
const { resolveScope, buildFilter } = await import("@/lib/submissions");
import type { Session } from "@/lib/auth";
import type { CompanyMemberView } from "@/lib/company";

function fakeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "user-1",
    email: "alice@empresa-a.com",
    name: "Alice",
    firstName: "",
    lastName: "",
    phone: "",
    city: "",
    birthDate: "",
    address: "",
    avatarUrl: "",
    plan: "",
    planSelectedAt: "",
    company: "company-a",
    companyRole: "member",
    created: "",
    updated: "",
    ...overrides,
  };
}

function fakeMember(userId: string, overrides: Partial<CompanyMemberView> = {}): CompanyMemberView {
  return {
    id: `member-${userId}`,
    role: "member",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    user: { id: userId, email: `${userId}@empresa-a.com`, name: userId },
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(listCompanyMembers).mockReset();
});

describe("resolveScope", () => {
  it("defaults to 'mine' when scope is not requested", async () => {
    const result = await resolveScope(fakeSession(), {});
    expect(result).toEqual({ scope: "mine" });
    expect(listCompanyMembers).not.toHaveBeenCalled();
  });

  it("falls back to 'mine' when 'team' is requested but the account has no company", async () => {
    const result = await resolveScope(fakeSession({ company: "" }), { scope: "team" });
    expect(result).toEqual({ scope: "mine" });
  });

  it("allows 'team' for any role, including plain member (decisión de producto)", async () => {
    const result = await resolveScope(fakeSession({ companyRole: "member" }), { scope: "team" });
    expect(result).toEqual({ scope: "team" });
    expect(listCompanyMembers).not.toHaveBeenCalled(); // sin memberId, no hace falta verificar nada
  });

  it("accepts a memberId that belongs to the same company", async () => {
    vi.mocked(listCompanyMembers).mockResolvedValue([
      fakeMember("user-1"),
      fakeMember("user-2"),
    ]);
    const result = await resolveScope(fakeSession(), { scope: "team", memberId: "user-2" });
    expect(result).toEqual({ scope: "team", memberId: "user-2" });
  });

  it("ignores a memberId belonging to a DIFFERENT company (empresa A intenta ver empresa B)", async () => {
    // listCompanyMembers("company-a") nunca devolvería a alguien de otra empresa;
    // simula exactamente eso: el memberId pedido no aparece en la lista.
    vi.mocked(listCompanyMembers).mockResolvedValue([fakeMember("user-1")]);
    const result = await resolveScope(fakeSession(), {
      scope: "team",
      memberId: "user-de-otra-empresa",
    });
    expect(result).toEqual({ scope: "team" }); // sin memberId -- nunca se refleja el id ajeno
    expect(listCompanyMembers).toHaveBeenCalledWith("company-a");
  });

  it("fails closed (never crashes, never trusts the memberId) when listCompanyMembers throws", async () => {
    vi.mocked(listCompanyMembers).mockRejectedValue(new Error("PocketBase down"));
    const result = await resolveScope(fakeSession(), { scope: "team", memberId: "user-2" });
    expect(result).toEqual({ scope: "team" }); // degrada a team sin filtro, nunca revienta ni confía en el id
  });
});

describe("buildFilter", () => {
  const pb = new PocketBase("http://test.local");
  const session = fakeSession();

  it("builds the 'mine' filter by default", () => {
    const filter = buildFilter(pb, session, { scope: "mine" });
    expect(filter).toBe("user = 'user-1'");
  });

  it("builds the 'team' filter scoped to the session's company", () => {
    const filter = buildFilter(pb, session, { scope: "team" });
    expect(filter).toBe("company = 'company-a'");
  });

  it("combines 'team' with a specific memberId", () => {
    const filter = buildFilter(pb, session, { scope: "team", memberId: "user-2" });
    expect(filter).toBe("company = 'company-a' && user = 'user-2'");
  });

  it("combines scope with a status filter", () => {
    const filter = buildFilter(pb, session, { scope: "mine", status: "completed" });
    expect(filter).toBe("user = 'user-1' && status = 'completed'");
  });

  it("ignores status = 'all'", () => {
    const filter = buildFilter(pb, session, { scope: "mine", status: "all" });
    expect(filter).toBe("user = 'user-1'");
  });

  it("searches both file_a_name and file_b_name for the query text", () => {
    const filter = buildFilter(pb, session, { scope: "mine", q: "factura" });
    expect(filter).toBe("user = 'user-1' && (file_a_name ~ 'factura' || file_b_name ~ 'factura')");
  });

  it("ignores a blank/whitespace-only query", () => {
    const filter = buildFilter(pb, session, { scope: "mine", q: "   " });
    expect(filter).toBe("user = 'user-1'");
  });

  it("combines a date range", () => {
    const filter = buildFilter(pb, session, {
      scope: "team",
      createdFrom: "2026-01-01",
      createdTo: "2026-01-31",
    });
    expect(filter).toBe(
      "company = 'company-a' && created >= '2026-01-01' && created <= '2026-01-31'",
    );
  });

  it("combines every filter at once (scope + member + status + query + dates)", () => {
    const filter = buildFilter(pb, session, {
      scope: "team",
      memberId: "user-2",
      status: "failed",
      q: "kiffer",
      createdFrom: "2026-01-01",
      createdTo: "2026-01-31",
    });
    expect(filter).toBe(
      "company = 'company-a' && user = 'user-2' && status = 'failed' && " +
        "(file_a_name ~ 'kiffer' || file_b_name ~ 'kiffer') && " +
        "created >= '2026-01-01' && created <= '2026-01-31'",
    );
  });
});
