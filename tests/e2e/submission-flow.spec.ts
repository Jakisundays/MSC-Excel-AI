import { randomUUID } from "crypto";
import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";
import { mockOrchestratorUpload, mockOrchestratorUploadFailure } from "./fixtures/orchestrator-mock";
import { simulateWebhookClose } from "./fixtures/simulate-webhook-close";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function buildXlsxBuffer(sheetName: string): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["col1", "col2"], ["valor1", "valor2"]]);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

/** Completa el formulario de nueva-solicitud con 2 Excel válidos, sin enviar. */
async function fillNewRequestForm(page: import("@playwright/test").Page) {
  await page.goto("/nueva-solicitud");
  const fileInputs = page.locator('input[type="file"]');
  await fileInputs.nth(0).setInputFiles({
    name: "e2e-archivo-a.xlsx",
    mimeType: XLSX_MIME,
    buffer: buildXlsxBuffer("HojaA"),
  });
  await fileInputs.nth(1).setInputFiles({
    name: "e2e-archivo-b.xlsx",
    mimeType: XLSX_MIME,
    buffer: buildXlsxBuffer("HojaB"),
  });
  // Cada FileSlot auto-selecciona la primera hoja detectada -- confirmamos
  // que el botón de enviar ya está habilitado antes de seguir.
  await expect(page.getByRole("button", { name: "Enviar al equipo" })).toBeEnabled();
}

test.describe("Flujo feliz completo: nueva-solicitud -> orchestrator -> webhook -> historial/detalle", () => {
  test("envía la solicitud, el orchestrator (interceptado) la acepta, y el cierre simulado la marca completada", async ({
    page,
    request,
  }) => {
    const requestId = randomUUID();
    await mockOrchestratorUpload(page, requestId);
    await fillNewRequestForm(page);

    const submissionCreated = page.waitForResponse(
      (res) => res.url().endsWith("/api/submissions") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Enviar al equipo" }).click();
    const submissionRes = await submissionCreated;
    expect(submissionRes.ok()).toBeTruthy();
    const { id: submissionId } = (await submissionRes.json()) as { id: string };
    expect(submissionId).toBeTruthy();

    await expect(page.getByRole("heading", { name: "Solicitud enviada" })).toBeVisible({
      timeout: 15_000,
    });

    // El estado async: nadie más que el webhook de cierre real puede
    // marcar la submission como completada -- lo simulamos con la misma
    // firma HMAC que usaría el orchestrator de verdad (hop 2).
    const webhookRes = await simulateWebhookClose(request, {
      requestId,
      status: "completed",
    });
    expect(webhookRes.ok()).toBeTruthy();

    await page.goto(`/historial/${submissionId}`);
    await expect(page.getByText("Completada").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: /Descargar resultado/i })).toBeVisible();

    // Los archivos ORIGINALES se suben directo navegador -> PocketBase en
    // paralelo al envío al orchestrator (ver docs/original-files-storage-plan.md);
    // si la subida llegó a tiempo, el detalle ofrece descargarlos.
    await expect(
      page.getByRole("link", { name: /Descargar original de Archivo A/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: /Descargar original de Archivo B/i }),
    ).toBeVisible();
  });

  test("un cierre fallido simulado marca la solicitud como error, con el mensaje del proveedor", async ({
    page,
    request,
  }) => {
    const requestId = randomUUID();
    await mockOrchestratorUpload(page, requestId);
    await fillNewRequestForm(page);

    const submissionCreated = page.waitForResponse(
      (res) => res.url().endsWith("/api/submissions") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Enviar al equipo" }).click();
    const { id: submissionId } = (await (await submissionCreated).json()) as { id: string };

    await expect(page.getByRole("heading", { name: "Solicitud enviada" })).toBeVisible({
      timeout: 15_000,
    });

    const webhookRes = await simulateWebhookClose(request, {
      requestId,
      status: "failed",
      errorMessage: "El proveedor no pudo procesar los archivos (E2E)",
    });
    expect(webhookRes.ok()).toBeTruthy();

    await page.goto(`/historial/${submissionId}`);
    await expect(page.getByText("Error", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("El proveedor no pudo procesar los archivos (E2E)").first(),
    ).toBeVisible();
  });

  test("si el orchestrator rechaza la subida, la solicitud queda marcada como fallida sin llegar al webhook", async ({
    page,
  }) => {
    await mockOrchestratorUploadFailure(page, 400, "Files must be Excel (.xlsx or .xls)");
    await fillNewRequestForm(page);

    await page.getByRole("button", { name: "Enviar al equipo" }).click();

    await expect(page.getByText("Files must be Excel (.xlsx or .xls)")).toBeVisible({
      timeout: 15_000,
    });
    // No debe mostrar la pantalla de éxito.
    await expect(page.getByRole("heading", { name: "Solicitud enviada" })).toHaveCount(0);
  });
});
