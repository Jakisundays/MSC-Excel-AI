import type { Page } from "@playwright/test";

/**
 * Intercepta la subida directa al orchestrator (NEXT_PUBLIC_ORCHESTRATOR_URL
 * -- hoy el droplet real, https://164-92-91-39.sslip.io) para que ningún
 * test E2E dispare un envío de correo real ni dependa de que el droplet
 * esté arriba. Responde como si el orchestrator hubiese aceptado el envío
 * (mismo shape que orchestrator/main.py devuelve en /uploadfiles).
 */
export async function mockOrchestratorUpload(page: Page, requestId: string) {
  const orchestratorUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL;
  if (!orchestratorUrl) {
    throw new Error("mockOrchestratorUpload: falta NEXT_PUBLIC_ORCHESTRATOR_URL en el entorno");
  }
  await page.route(`${orchestratorUrl}/uploadfiles`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        id: requestId,
        message: "Procesamiento completado y correo enviado",
        attachments: ["doc_a_test_seleccionado.xlsx", "doc_b_test_seleccionado.xlsx"],
        sheet_names: { file_a: "HojaA", file_b: "HojaB" },
        reply_to: [],
        recipient: ["cmatch.ia@witworks.cloud", "jacob@dinardi.com.ar"],
      }),
    });
  });
}

/** Variante que simula un orchestrator que rechaza el envío (ej. archivo inválido). */
export async function mockOrchestratorUploadFailure(page: Page, status: number, detail: string) {
  const orchestratorUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL;
  if (!orchestratorUrl) {
    throw new Error("mockOrchestratorUploadFailure: falta NEXT_PUBLIC_ORCHESTRATOR_URL en el entorno");
  }
  await page.route(`${orchestratorUrl}/uploadfiles`, async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ detail }),
    });
  });
}
