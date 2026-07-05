import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // .env.local nunca se carga acá a propósito: los tests de integración
    // necesitan controlar env vars (RESULT_WEBHOOK_SECRET, DEV_PREVIEW, etc.)
    // de forma explícita y determinística por test, no heredar el entorno
    // real de desarrollo. Estos son valores fake fijos, no credenciales reales.
    env: {
      UPLOAD_TICKET_SECRET: "test-upload-ticket-secret",
      RESULT_WEBHOOK_SECRET: "test-result-webhook-secret",
      POCKETBASE_URL: "https://fake-pocketbase.test",
      POCKETBASE_ADMIN_EMAIL: "admin@test.local",
      POCKETBASE_ADMIN_PASSWORD: "fake-admin-password",
      NEXT_PUBLIC_ORCHESTRATOR_URL: "https://fake-orchestrator.test",
      NEXT_PUBLIC_DEV_PREVIEW: "", // fuerza DEV_PREVIEW=false salvo que un test lo mockee explícito
    },
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/helpers/server-only-stub.ts"),
      "@": path.resolve(__dirname, "."),
    },
  },
});
