import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El frontend NO proxea archivos pesados (límite ~4.5MB de Vercel):
  // el navegador sube directo al orchestrator del Droplet. Aquí solo
  // viajan payloads chicos (tickets, metadata de submissions).
  reactStrictMode: true,
  // El home del usuario tiene otro lockfile; fijamos la raíz a este
  // proyecto para que el file tracing de Next sea correcto.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
