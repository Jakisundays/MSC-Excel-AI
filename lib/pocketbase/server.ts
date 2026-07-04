import "server-only";

import PocketBase from "pocketbase";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { PB_COOKIE } from "@/lib/constants";

export { PB_COOKIE };

/**
 * Crea una instancia NUEVA de PocketBase por request (regla SSR:
 * nunca un singleton global; los requests de distintos usuarios
 * pisarían el mismo authStore) y carga la sesión desde la cookie.
 */
export async function getServerPb(): Promise<PocketBase> {
  const pb = new PocketBase(env.POCKETBASE_URL);
  const raw = (await cookies()).get(PB_COOKIE)?.value;
  if (raw) {
    try {
      const { token, record } = JSON.parse(raw);
      pb.authStore.save(token, record);
    } catch {
      // cookie corrupta → sesión vacía
    }
  }
  return pb;
}

/** Serializa el authStore actual para guardarlo en la cookie httpOnly. */
export function serializeAuth(pb: PocketBase): string {
  return JSON.stringify({
    token: pb.authStore.token,
    record: pb.authStore.record,
  });
}

export const authCookieOptions = {
  httpOnly: true,
  secure: env.IS_PROD,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 14, // 14 días
};
