import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MSC Excel AI",
    short_name: "MSC Excel AI",
    description: "Procesamiento de archivos Excel con apoyo de IA",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#eff5f0",
    theme_color: "#10271a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
