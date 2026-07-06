"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyLinkButton({
  url,
  label = "Copiar enlace de la solicitud",
  copiedLabel = "Enlace copiado",
  className,
}: {
  /** URL a copiar. Default: la de la página actual (uso original, en Detalle de solicitud). */
  url?: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url ?? window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard no disponible */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "hover:bg-muted flex w-full items-center gap-2.5 rounded-full px-3 py-2.5 text-left text-[12.5px] font-medium transition-colors",
        className,
      )}
    >
      {copied ? (
        <Check className="text-success size-4 shrink-0" aria-hidden />
      ) : (
        <Link2 className="text-muted-foreground size-4 shrink-0" aria-hidden />
      )}
      {copied ? copiedLabel : label}
    </button>
  );
}
