import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Iniciales para avatar fallback a partir de un nombre y/o email. */
export function initials(name: string, email: string): string {
  const base = name?.trim() || email.split("@")[0] || "";
  const parts = base.split(/[.\s_-]+/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : base.slice(0, 2);
  return chars.toUpperCase();
}
