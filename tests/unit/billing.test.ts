import { describe, expect, it } from "vitest";
import { PLAN_CATALOG, PLAN_KEYS, RECOMMENDED_PLAN, isPlanKey } from "@/lib/billing";

describe("PLAN_CATALOG", () => {
  it("has exactly the 3 documented plans with matching keys", () => {
    expect(PLAN_KEYS).toEqual(["esencial", "profesional", "corporativo"]);
    for (const key of PLAN_KEYS) {
      expect(PLAN_CATALOG[key].key).toBe(key);
    }
  });

  it("matches the documented prices (memory: USD 1.000 / 1.800 / 3.500)", () => {
    expect(PLAN_CATALOG.esencial.priceLabel).toBe("USD 1.000");
    expect(PLAN_CATALOG.profesional.priceLabel).toBe("USD 1.800");
    expect(PLAN_CATALOG.corporativo.priceLabel).toBe("USD 3.500");
  });

  it("marks profesional as the recommended plan", () => {
    expect(RECOMMENDED_PLAN).toBe("profesional");
  });
});

describe("isPlanKey", () => {
  it.each(["esencial", "profesional", "corporativo"])("accepts %s", (key) => {
    expect(isPlanKey(key)).toBe(true);
  });

  it.each(["", "gratis", "ESENCIAL", 42, null, undefined, {}])("rejects %s", (value) => {
    expect(isPlanKey(value)).toBe(false);
  });
});
