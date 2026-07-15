import { describe, expect, it } from "vitest";
import { invalidEmails, isValidEmail, isValidPassword, PASSWORD_MIN_LENGTH } from "@/lib/validators";

// PASSWORD_MAX_LENGTH no se exporta desde lib/validators.ts (bcrypt trunca en
// 72 bytes), así que se fija aquí tras confirmar el valor exacto en el código.
const PASSWORD_MAX_LENGTH = 72;

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

describe("isValidPassword", () => {
  it.each([
    "a".repeat(PASSWORD_MIN_LENGTH - 2) + "1", // demasiado corta (por debajo del mínimo)
    "a".repeat(PASSWORD_MIN_LENGTH), // solo letras, sin dígito
    "1".repeat(PASSWORD_MIN_LENGTH), // solo dígitos, sin letra
    "", // vacía
    "a".repeat(PASSWORD_MAX_LENGTH) + "1", // un caracter por encima del máximo
  ])("rejects %s", (password) => {
    expect(isValidPassword(password)).toBe(false);
  });

  it.each([
    "a".repeat(PASSWORD_MIN_LENGTH - 1) + "1", // límite exacto del mínimo
    "a".repeat(PASSWORD_MAX_LENGTH - 1) + "1", // límite exacto del máximo
  ])("accepts %s", (password) => {
    expect(isValidPassword(password)).toBe(true);
  });
});
