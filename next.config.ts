import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El frontend NO proxea archivos pesados (límite ~4.5MB de Vercel):
  // el navegador sube directo al orchestrator del Droplet. Aquí solo
  // viajan payloads chicos (tickets, metadata de submissions).
  reactStrictMode: true,
};

export default nextConfig;
