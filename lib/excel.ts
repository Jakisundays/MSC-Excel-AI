import * as XLSX from "xlsx";

/**
 * Lógica de Excel del lado cliente (reemplaza lo que hacía el Streamlit
 * con openpyxl/pandas). Corre en el navegador con SheetJS, así los
 * archivos pesados NO pasan por Vercel.
 */

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Lee los nombres de hoja de un Excel (.xlsx/.xls). */
export async function readSheetNames(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", bookSheets: true });
  return wb.SheetNames ?? [];
}

export interface FilteredExcel {
  blob: Blob;
  filename: string;
}

/**
 * Conserva SOLO la hoja seleccionada y exporta a .xlsx (también convierte
 * .xls → .xlsx). Equivale a `build_filtered_excel_upload_bytes` del Streamlit.
 *
 * Nota: SheetJS (community) preserva los DATOS de la hoja; puede no preservar
 * todo el formato/fórmulas como openpyxl. Para este flujo (el equipo lee los
 * datos) es suficiente.
 */
export async function filterToSelectedSheet(
  file: File,
  sheetName: string,
): Promise<FilteredExcel> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  if (!wb.SheetNames.includes(sheetName)) {
    throw new Error(
      `No se encontró la hoja "${sheetName}" en ${file.name}.`,
    );
  }

  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, wb.Sheets[sheetName], sheetName);

  const arrayBuffer = XLSX.write(out, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;

  const base = file.name.replace(/\.[^.]+$/, "");
  return {
    blob: new Blob([arrayBuffer], { type: XLSX_MIME }),
    filename: `${base}_seleccionado.xlsx`,
  };
}
