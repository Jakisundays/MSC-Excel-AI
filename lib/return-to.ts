/**
 * Valida un `returnTo` (login → invitaciones u otras rutas post-auth).
 * Solo rutas internas relativas: bloquea `//host` (protocol-relative) y
 * cualquier esquema (`http:`, `javascript:`, etc.) para evitar open-redirect.
 */
export function isSafeReturnTo(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}
