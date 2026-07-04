import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El frontend NO proxea archivos pesados (límite ~4.5MB de Vercel):
  // el navegador sube directo al orchestrator del Droplet. Aquí solo
  // viajan payloads chicos (tickets, metadata de submissions).
  reactStrictMode: true,
  // El home del usuario tiene otro lockfile; fijamos la raíz a este
  // proyecto para que el file tracing de Next sea correcto.
  outputFileTracingRoot: import.meta.dirname,
  // Headers de seguridad básicos (auditoría técnica 2026-07-03, quick win).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
