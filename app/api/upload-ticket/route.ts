import { NextResponse } from "next/server";
import {
  getServerPb,
  PB_COOKIE,
  serializeAuth,
  authCookieOptions,
} from "@/lib/pocketbase/server";
import { signUploadTicket } from "@/lib/ticket";
import { env } from "@/lib/env";

/**
 * Emite un upload-ticket de corta duración tras validar la sesión
 * (authRefresh = validación autoritativa contra PocketBase).
 * Payload chico (sin archivos) → seguro bajo el límite de Vercel.
 */
export async function POST() {
  const pb = await getServerPb();

  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    await pb.collection("users").authRefresh();
  } catch {
    return NextResponse.json(
      { error: "Sesión expirada" },
      { status: 401 },
    );
  }

  const record = pb.authStore.record!;
  const ticket = await signUploadTicket({
    sub: record.id,
    email: record.email as string,
  });

  const res = NextResponse.json({
    ticket,
    orchestratorUrl: env.ORCHESTRATOR_URL,
  });
  // re-persistir la cookie con el token refrescado
  res.cookies.set(PB_COOKIE, serializeAuth(pb), authCookieOptions);
  return res;
}
