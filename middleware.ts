import { NextRequest, NextResponse } from "next/server";

/**
 * Gate barato en el edge: revisa presencia + expiración del token PB
 * (sin llamadas de red). La validación autoritativa contra PocketBase
 * ocurre en /api/upload-ticket (authRefresh) y en los server components
 * al consultar datos.
 */
const PB_COOKIE = "pb_auth";

function decodeExp(raw?: string): number | null {
  if (!raw) return null;
  try {
    const { token } = JSON.parse(raw);
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return null;
    const normalized = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const raw = req.cookies.get(PB_COOKIE)?.value;
  const exp = decodeExp(raw);
  const valid = exp !== null && exp * 1000 > Date.now();

  // Ya logueado y entrando a /login → al dashboard
  if (pathname === "/login" && valid) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Rutas protegidas sin sesión válida → login
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/nueva-solicitud") ||
    pathname.startsWith("/historial");

  if (isProtected && !valid) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    if (raw) res.cookies.delete(PB_COOKIE);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/nueva-solicitud/:path*",
    "/historial/:path*",
  ],
};
