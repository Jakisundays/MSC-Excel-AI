/**
 * Constantes compartidas entre el edge middleware y el código de
 * servidor (route handlers/server components). Vive en un módulo sin
 * dependencias (nada de "server-only" ni next/headers) para poder
 * importarse tanto desde middleware.ts (edge runtime) como desde
 * lib/pocketbase/server.ts (node runtime) sin duplicar el literal.
 */
export const PB_COOKIE = "pb_auth";
