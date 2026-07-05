import { describe, expect, it } from "vitest";
import { invalidEmails, isValidEmail } from "@/lib/validators";

describe("isValidEmail", () => {
  it.each([
    "alice@example.com",
    "a.b+tag@sub.example.co",
    "  alice@example.com  ", // se recorta con .trim() antes del regex
  ])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(["", "not-an-email", "alice@", "@example.com", "alice@example", "alice example.com"])(
    "rejects %s",
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );
});

describe("invalidEmails", () => {
  it("returns only the invalid entries, preserving order", () => {
    const result = invalidEmails(["alice@example.com", "bad", "bob@example.com", "also-bad"]);
    expect(result).toEqual(["bad", "also-bad"]);
  });

  it("returns an empty array when all emails are valid", () => {
    expect(invalidEmails(["alice@example.com", "bob@example.com"])).toEqual([]);
  });
});
