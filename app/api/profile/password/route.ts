import { NextRequest, NextResponse } from "next/server";
import { ClientResponseError } from "pocketbase";

import {
  getServerPb,
  PB_COOKIE,
  serializeAuth,
  authCookieOptions,
} from "@/lib/pocketbase/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Cambia la contraseña del usuario autenticado. PocketBase invalida el
 * token actual al rotar la contraseña, así que reautenticamos con la
 * nueva contraseña para no cerrarle la sesión a mitad de la acción.
 */
export async function POST(req: NextRequest) {
  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!checkRateLimit(`profile-password:${pb.authStore.record!.id}`, 5, 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Esperá un minuto e intentá de nuevo." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const oldPassword = typeof body.oldPassword === "string" ? body.oldPassword : "";
  const password = typeof body.password === "string" ? body.password : "";
  const passwordConfirm =
    typeof body.passwordConfirm === "string" ? body.passwordConfirm : "";

  if (!oldPassword || !password) {
    return NextResponse.json(
      { error: "Completá la contraseña actual y la nueva." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "La nueva contraseña debe tener al menos 8 caracteres." },
      { status: 400 },
    );
  }
  if (password !== passwordConfirm) {
    return NextResponse.json(
      { error: "Las contraseñas no coinciden." },
      { status: 400 },
    );
  }

  const userId = pb.authStore.record!.id;
  const email = pb.authStore.record!.email as string;

  try {
    await pb.collection("users").update(userId, {
      oldPassword,
      password,
      passwordConfirm,
    });
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 400) {
      return NextResponse.json(
        { error: "La contraseña actual es incorrecta." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "No se pudo actualizar la contraseña." },
      { status: 500 },
    );
  }

  try {
    await pb.collection("users").authWithPassword(email, password);
  } catch {
    // La contraseña ya cambió; si la re-autenticación falla igual devolvemos
    // éxito y el usuario simplemente tendrá que volver a iniciar sesión.
    const res = NextResponse.json({ ok: true, reauthed: false });
    res.cookies.delete(PB_COOKIE);
    return res;
  }

  const res = NextResponse.json({ ok: true, reauthed: true });
  res.cookies.set(PB_COOKIE, serializeAuth(pb), authCookieOptions);
  return res;
}
