import { expect, test } from "@playwright/test";
import { E2E_TEST_EMAIL, E2E_TEST_PASSWORD } from "./fixtures/test-user";

async function logout(page: import("@playwright/test").Page) {
  // El logout vive en el dropdown del footer del sidebar (app-sidebar.tsx),
  // disparado por un botón que muestra el email de la sesión -- hay que
  // abrirlo antes de poder clickear "Cerrar sesión".
  await page.getByRole("button", { name: E2E_TEST_EMAIL }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
}

// Estos tests ejercitan la pantalla de login real -- arrancan sin sesión
// (storageState vacío), a diferencia del resto de la suite que usa la
// sesión ya autenticada de global-setup.ts.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Login", () => {
  test("inicia sesión con credenciales válidas y redirige a /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(E2E_TEST_EMAIL);
    await page.getByLabel("Contraseña", { exact: true }).fill(E2E_TEST_PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Resumen" }).first()).toBeVisible();
  });

  test("credenciales inválidas muestran el error correcto y no navegan", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(E2E_TEST_EMAIL);
    await page.getByLabel("Contraseña", { exact: true }).fill("contraseña-incorrecta-a-proposito");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("visitar una ruta protegida sin sesión redirige a /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("Logout", () => {
  test.use({ storageState: "./tests/e2e/.auth/user.json" });

  test("cierra sesión y la ruta protegida vuelve a redirigir a /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Resumen" }).first()).toBeVisible();

    await logout(page);
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
