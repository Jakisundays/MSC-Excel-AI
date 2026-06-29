import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MSC Excel AI",
  description: "Procesamiento de archivos Excel con apoyo de IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
