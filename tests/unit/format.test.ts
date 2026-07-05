process.env.TZ = "America/Panama"; // determinismo del boundary hoy/ayer sin importar el TZ de la máquina que corre el test

import { afterEach, describe, expect, it, vi } from "vitest";
import { formatBytes, formatDateTime, formatDuration, relativeDay } from "@/lib/format";

const EXOTIC_SPACE_CODES = [160, 8199, 8201, 8239, 12288];

describe("formatDuration", () => {
  it("returns 0m for zero or negative durations", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(-1)).toBe("0m");
  });

  it("formats minutes when under an hour", () => {
    expect(formatDuration(42 * 60_000)).toBe("42m");
  });

  it("formats hours with 1 decimal when under a day", () => {
    expect(formatDuration(3 * 60 * 60_000 + 12 * 60_000)).toBe("3.2h");
  });

  it("formats days with 1 decimal beyond 24h", () => {
    expect(formatDuration(36 * 60 * 60_000)).toBe("1.5d");
  });
});

describe("formatBytes", () => {
  it("formats bytes under 1KB as B", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats under 1MB as whole KB", () => {
    expect(formatBytes(2048)).toBe("2 KB");
  });

  it("formats 1MB and above as MB with 1 decimal", () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});

describe("formatDateTime", () => {
  it("never contains exotic space characters (hydration-mismatch regression, ver memory feedback)", () => {
    const result = formatDateTime("2026-07-04T15:30:00.000Z");
    for (const code of EXOTIC_SPACE_CODES) {
      expect(result).not.toContain(String.fromCharCode(code));
    }
  });

  it("falls back to the raw ISO string on an invalid date", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});

describe("relativeDay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'hoy' for today's date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00.000Z"));
    expect(relativeDay("2026-07-04T05:00:00.000Z")).toBe("hoy");
  });

  it("returns 'ayer' for yesterday's date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00.000Z"));
    expect(relativeDay("2026-07-03T05:00:00.000Z")).toBe("ayer");
  });

  it("falls back to a short date (not 'hoy'/'ayer') for older dates, with no exotic spaces", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00.000Z"));
    const result = relativeDay("2026-01-01T05:00:00.000Z");
    expect(result).not.toBe("hoy");
    expect(result).not.toBe("ayer");
    for (const code of EXOTIC_SPACE_CODES) {
      expect(result).not.toContain(String.fromCharCode(code));
    }
  });

  it("falls back to the raw ISO string on an invalid date", () => {
    expect(relativeDay("not-a-date")).toBe("not-a-date");
  });
});
