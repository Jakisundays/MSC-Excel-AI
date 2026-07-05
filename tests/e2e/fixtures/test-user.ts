/**
 * Cuenta dedicada para los tests E2E de Playwright, contra la PocketBase
 * real de Railway (decisión explícita, jul 2026: no hay PocketBase local
 * ni proveedor mockeado -- el orchestrator/email SÍ se intercepta siempre,
 * ver tests/e2e/fixtures/orchestrator-mock.ts). Recreable: si el usuario
 * no existe, global-setup.ts lo crea; si existe, resetea su contraseña a
 * este valor conocido. Nunca usar esta cuenta para nada real.
 */
export const E2E_TEST_EMAIL = "playwright-e2e@dinardi.com.ar";
export const E2E_TEST_PASSWORD = "Pw-E2E-Test-2026-Ephemeral!";
export const E2E_TEST_NAME = "Playwright E2E";
