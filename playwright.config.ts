import fs from "fs";
import path from "path";
import { defineConfig, devices } from "@playwright/test";

// `next dev` carga .env.local automáticamente; el proceso de Playwright
// (este config + global-setup.ts) es un proceso Node separado que no lo
// hace solo -- lo cargamos acá para que ambos vean las mismas env vars
// reales (PocketBase de Railway, secretos de webhook, etc; nunca infra
// mockeada salvo el orchestrator/email, ver fixtures/orchestrator-mock.ts).
const envLocalPath = path.resolve(__dirname, ".env.local");
if (fs.existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath);
}

const PORT = 3100;
const BASE_URL = process.env.APP_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // comparten un único usuario de test + PocketBase real -- evita carreras entre submissions
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  timeout: 30_000,

  use: {
    baseURL: BASE_URL,
    storageState: "./tests/e2e/.auth/user.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      // DEV_PREVIEW debe estar apagado: los E2E corren contra la
      // PocketBase real (decisión explícita, jul 2026), no contra los
      // mocks in-memory de lib/preview.ts.
      NEXT_PUBLIC_DEV_PREVIEW: "false",
    },
  },
});
