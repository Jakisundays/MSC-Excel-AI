import { describe, expect, it } from "vitest";
import { jwtVerify } from "jose";
import { signUploadTicket } from "@/lib/ticket";

describe("signUploadTicket", () => {
  it("signs a JWT with sub, email claim, HS256 and a 5 minute expiry", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signUploadTicket({ sub: "user-123", email: "alice@example.com" });

    const secret = new TextEncoder().encode("test-upload-ticket-secret");
    const { payload, protectedHeader } = await jwtVerify(token, secret);

    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.sub).toBe("user-123");
    expect(payload.email).toBe("alice@example.com");
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    const ttl = (payload.exp as number) - (payload.iat as number);
    expect(ttl).toBe(300); // 5m
    expect(payload.iat as number).toBeGreaterThanOrEqual(before);
  });

  it("rejects verification with the wrong secret", async () => {
    const token = await signUploadTicket({ sub: "user-123", email: "alice@example.com" });
    const wrongSecret = new TextEncoder().encode("some-other-secret");
    await expect(jwtVerify(token, wrongSecret)).rejects.toThrow();
  });

  it("produces a token that is already expired 301 seconds later", async () => {
    const token = await signUploadTicket({ sub: "user-123", email: "alice@example.com" });
    const secret = new TextEncoder().encode("test-upload-ticket-secret");
    const futureMs = Date.now() + 301_000;
    await expect(
      jwtVerify(token, secret, { currentDate: new Date(futureMs) }),
    ).rejects.toThrow(/exp/i);
  });
});
