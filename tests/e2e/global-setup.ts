import fs from "fs";
import path from "path";
import PocketBase from "pocketbase";
import { request as playwrightRequest, type FullConfig } from "@playwright/test";
import { E2E_TEST_EMAIL, E2E_TEST_NAME, E2E_TEST_PASSWORD } from "./fixtures/test-user";

export const STORAGE_STATE_PATH = path.join(__dirname, ".auth/user.json");

/**
 * Corre una vez antes de toda la suite E2E (ver playwright.config.ts):
 * 1. Asegura que exista (idempotente) el usuario de test dedicado en la
 *    PocketBase REAL de Railway -- decisión explícita (jul 2026): usar el
 *    proveedor hosteado real con una cuenta acotada, en vez de una
 *    PocketBase local, ya que ya está configurado y funcionando.
 * 2. Hace login con ESE usuario a través de la ruta real de la app
 *    (/api/auth/login-password, no PocketBase directo) para que la cookie
 *    de sesión guardada sea EXACTAMENTE la que produce el código de
 *    producción -- no una reconstrucción a mano propensa a desincronizarse
 *    con el formato real de la cookie.
 * 3. Persiste ese storageState para que el resto de los tests arranquen
 *    ya autenticados (ver playwright.config.ts `use.storageState`).
 *
 * El orchestrator/email NUNCA se tocan acá ni en ningún test E2E -- eso se
 * intercepta a nivel de página (ver fixtures/orchestrator-mock.ts).
 */
export default async function globalSetup(config: FullConfig) {
  const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
  const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
  const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!pbUrl || !adminEmail || !adminPassword) {
    throw new Error(
      "global-setup: faltan NEXT_PUBLIC_POCKETBASE_URL/POCKETBASE_ADMIN_EMAIL/POCKETBASE_ADMIN_PASSWORD " +
        "en el entorno -- correr `npm run test:e2e` carga .env.local igual que `next dev`.",
    );
  }

  const adminPb = new PocketBase(pbUrl);
  await adminPb.collection("_superusers").authWithPassword(adminEmail, adminPassword);

  try {
    const existing = await adminPb
      .collection("users")
      .getFirstListItem(adminPb.filter("email = {:email}", { email: E2E_TEST_EMAIL }));
    await adminPb.collection("users").update(existing.id, {
      password: E2E_TEST_PASSWORD,
      passwordConfirm: E2E_TEST_PASSWORD,
    });
  } catch {
    await adminPb.collection("users").create({
      email: E2E_TEST_EMAIL,
      password: E2E_TEST_PASSWORD,
      passwordConfirm: E2E_TEST_PASSWORD,
      name: E2E_TEST_NAME,
      emailVisibility: true,
      verified: true,
    });
  }

  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3100";
  const apiContext = await playwrightRequest.newContext({ baseURL });
  const res = await apiContext.post("/api/auth/login-password", {
    data: { email: E2E_TEST_EMAIL, password: E2E_TEST_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(
      `global-setup: POST /api/auth/login-password falló (${res.status()}): ${await res.text()}`,
    );
  }

  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await apiContext.storageState({ path: STORAGE_STATE_PATH });
  await apiContext.dispose();
}
