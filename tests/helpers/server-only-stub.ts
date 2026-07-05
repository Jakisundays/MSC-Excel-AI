// Alias de "server-only" para tests (ver vitest.config.ts). El paquete real
// lanza si no se resuelve la condición de export "react-server" (la que usa
// el bundler de Next.js) -- Vitest corre bajo Node plano, así que sin este
// alias cualquier módulo con `import "server-only"` (hmac.ts, ticket.ts,
// env.ts, admin.ts, server.ts) rompería al importarse en un test.
export {};
