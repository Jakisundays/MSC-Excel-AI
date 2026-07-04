import { NextRequest, NextResponse } from "next/server";
import PocketBase, { ClientResponseError } from "pocketbase";

import { env } from "@/lib/env";
import { getServerPb, PB_COOKIE } from "@/lib/pocketbase/server";

/**
 * Elimina permanentemente la cuenta del usuario autenticado. Exige la
 * contraseña actual como confirmación (defensa extra para una acción
 * destructiva e irreversible). El relation `user` en `submissions` tiene
 * cascadeDelete, así que sus solicitudes se borran junto con la cuenta.
 */
export async function POST(req: NextRequest) {
  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const email = pb.authStore.record!.email as string;
  const userId = pb.authStore.record!.id;

  if (!password) {
    return NextResponse.json(
      { error: "Ingresá tu contraseña para confirmar." },
      { status: 400 },
    );
  }

  const check = new PocketBase(env.POCKETBASE_URL);
  try {
    await check.collection("users").authWithPassword(email, password);
  } catch {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

  try {
    await pb.collection("users").delete(userId);
  } catch (e) {
    const message =
      e instanceof ClientResponseError ? e.message : "No se pudo eliminar la cuenta.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PB_COOKIE);
  return res;
}
