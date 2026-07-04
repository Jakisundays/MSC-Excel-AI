import { cn } from "@/lib/utils";

/** Marca MSC Excel AI: grilla de 4 celdas, una resaltada en dorado — la fila
 * que la IA encuentra por vos. Colores fijos (no reactivos a claro/oscuro),
 * igual que el resto de la identidad de marca. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={cn("size-4", className)}
    >
      <rect x="12.8" y="12.8" width="16.5" height="16.5" rx="5.28" fill="rgba(255,255,255,.34)" />
      <rect x="34.7" y="12.8" width="16.5" height="16.5" rx="5.28" fill="#d7ac6e" />
      <rect x="12.8" y="34.7" width="16.5" height="16.5" rx="5.28" fill="rgba(255,255,255,.34)" />
      <rect x="34.7" y="34.7" width="16.5" height="16.5" rx="5.28" fill="rgba(255,255,255,.16)" />
    </svg>
  );
}
