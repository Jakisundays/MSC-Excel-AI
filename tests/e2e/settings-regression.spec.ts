import { expect, test } from "@playwright/test";

// Regresión de las 5 páginas de Configuración -- fáciles de romper sin
// darse cuenta dado que comparten layout con un route group
// (app/perfil/(narrow)/ vs. app/perfil/planes/ afuera del grupo a
// propósito, ver memoria del proyecto).
const PAGES: Array<{ path: string; heading: string }> = [
  { path: "/perfil", heading: "Perfil" },
  { path: "/perfil/seguridad", heading: "Seguridad" },
  { path: "/perfil/cuenta", heading: "Cuenta" },
  { path: "/perfil/privacidad", heading: "Privacidad y datos" },
  { path: "/perfil/planes", heading: "Elegí el plan para tu equipo" },
];

for (const { path, heading } of PAGES) {
  test(`${path} carga y muestra su título`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    expect(consoleErrors, `console errors on ${path}: ${consoleErrors.join("; ")}`).toEqual([]);
  });
}

test("Planes muestra los 3 planes reales con sus precios", async ({ page }) => {
  await page.goto("/perfil/planes");
  await expect(page.getByText("Esencial", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("USD 1.000")).toBeVisible();
  await expect(page.getByText("Profesional", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("USD 1.800")).toBeVisible();
  await expect(page.getByText("Corporativo", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("USD 3.500")).toBeVisible();
});

test("elegir un plan real en Planes lo refleja en Cuenta, con 'Ver historial de facturación' deshabilitado", async ({
  page,
}) => {
  // Selecciona un plan real (POST /api/billing/plan, escribe en PocketBase)
  // -- solo entonces Cuenta muestra el bloque de plan + el placeholder de
  // facturación (app/perfil/(narrow)/cuenta/page.tsx:60-69). Re-runnable:
  // si una corrida anterior ya dejó un plan elegido para este usuario de
  // test, ningún botón dirá "Elegir ..." y simplemente no hace falta
  // volver a elegir -- el punto es que *algún* plan quede activo.
  await page.goto("/perfil/planes");
  const chooseButtons = page.getByRole("button", { name: /^Elegir /i });
  if (await chooseButtons.count()) {
    await chooseButtons.first().click();
    await expect(page.getByRole("button", { name: "Plan actual" })).toBeVisible({ timeout: 10_000 });
  }

  await page.goto("/perfil/cuenta");
  await expect(page.getByText(/USD (1\.000|1\.800|3\.500)/)).toBeVisible();
  await expect(page.getByRole("button", { name: /historial de facturación/i })).toBeDisabled();
});

test("Seguridad muestra 2FA como 'Próximamente' (no fabricado)", async ({ page }) => {
  await page.goto("/perfil/seguridad");
  await expect(page.getByText("Próximamente").first()).toBeVisible();
});

test("Dashboard y Historial no confunden estado vacío con estado de error", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Resumen" }).first()).toBeVisible();
  // No debe verse el copy de error de PocketBase en un dashboard que carga bien.
  await expect(page.getByText("No se pudo cargar tu actividad")).toHaveCount(0);

  await page.goto("/historial");
  await expect(page.getByText("No se pudo cargar el historial")).toHaveCount(0);
});
