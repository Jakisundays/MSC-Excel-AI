import { NextRequest, NextResponse } from "next/server";
import { ClientResponseError } from "pocketbase";
import {
  PB_COOKIE,
  serializeAuth,
  authCookieOptions,
} from "@/lib/pocketbase/server";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { isValidEmail, isValidPassword } from "@/lib/validators";

// Mismo tope que companies.name (ver app/api/companies/route.ts).
const NAME_MAX_LENGTH = 120;

/**
 * Registro self-service por email + contraseña.
 *
 * A propósito NO valida contra ninguna allowlist (isEmailAllowed /
 * ALLOWED_EMAILS / ALLOWED_EMAIL_DOMAINS) -- el alta es abierta.
 */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(`register:${clientIp(req)}`, 5, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const passwordConfirm =
    typeof body?.passwordConfirm === "string" ? body.passwordConfirm : "";

  if (
    !name ||
    name.length > NAME_MAX_LENGTH ||
    !isValidEmail(email) ||
    !isValidPassword(password) ||
    password !== passwordConfirm
  ) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const admin = await getAdminPb();

  let userId: string;
  try {
    const created = await admin.collection("users").create({
      name,
      email,
      password,
      passwordConfirm,
    });
    userId = created.id;
  } catch (err) {
    if (err instanceof ClientResponseError && err.status < 500) {
      // Mensaje genérico a propósito: debe cubrir tanto "el email ya
      // existe" como cualquier otro rechazo de validación de PocketBase,
      // de forma indistinguible, para no permitir enumeración de usuarios
      // por email. No es una decisión de estilo, es un requisito de
      // seguridad.
      return NextResponse.json({ error: "registration_failed" }, { status: 400 });
    }
    return NextResponse.json({ error: "network" }, { status: 502 });
  }

  let sessionPb;
  try {
    // duration 0 = TTL default de la colección (igual que
    // authWithPassword/authWithOAuth2Code en el resto de la app).
    sessionPb = await admin.collection("users").impersonate(userId, 0);
  } catch {
    // La cuenta ya se creó pero no pudimos emitir la sesión -- no
    // revertimos el alta (el usuario igual puede iniciar sesión vía
    // /login).
    return NextResponse.json({ error: "network" }, { status: 502 });
  }

  const record = sessionPb.authStore.record;
  const finalName = (record?.name as string) || name;

  const res = NextResponse.json({ ok: true, name: finalName });
  res.cookies.set(PB_COOKIE, serializeAuth(sessionPb), authCookieOptions);
  return res;
}
