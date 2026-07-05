import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { filterToSelectedSheet, readSheetNames } from "@/lib/excel";

function makeWorkbookFile(sheets: Record<string, unknown[][]>, filename = "input.xlsx"): File {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
  return new File([new Uint8Array(buffer)], filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("readSheetNames", () => {
  it("returns every sheet name in the workbook, in order", async () => {
    const file = makeWorkbookFile({ HojaA: [["x"]], HojaB: [["y"]] });
    await expect(readSheetNames(file)).resolves.toEqual(["HojaA", "HojaB"]);
  });
});

describe("filterToSelectedSheet", () => {
  it("keeps only the selected sheet and renames the file with the _seleccionado suffix", async () => {
    const file = makeWorkbookFile(
      { HojaA: [["uno", "dos"]], HojaB: [["tres"]] },
      "original.xlsx",
    );
    const result = await filterToSelectedSheet(file, "HojaA");
    expect(result.filename).toBe("original_seleccionado.xlsx");

    const buf = Buffer.from(await result.blob.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toEqual(["HojaA"]);
  });

  it("strips a legacy .xls extension the same way (converts to .xlsx)", async () => {
    const file = makeWorkbookFile({ HojaA: [["x"]] }, "legacy.xls");
    const result = await filterToSelectedSheet(file, "HojaA");
    expect(result.filename).toBe("legacy_seleccionado.xlsx");
  });

  it("throws a clear, user-facing error when the sheet doesn't exist", async () => {
    const file = makeWorkbookFile({ HojaA: [["x"]] }, "input.xlsx");
    await expect(filterToSelectedSheet(file, "NoExiste")).rejects.toThrow(
      /No se encontró la hoja "NoExiste" en input\.xlsx/,
    );
  });
});
