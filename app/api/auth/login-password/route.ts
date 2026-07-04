import { NextRequest, NextResponse } from "next/server";
import PocketBase, { ClientResponseError } from "pocketbase";
import { env, isEmailAllowed } from "@/lib/env";
import {
  PB_COOKIE,
  serializeAuth,
  authCookieOptions,
} from "@/lib/pocketbase/server";

/** Login con correo + contraseña (alternativa a Google OAuth). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 400 });
  }

  const pb = new PocketBase(env.POCKETBASE_URL);

  try {
    await pb.collection("users").authWithPassword(email, password);
  } catch (err) {
    if (err instanceof ClientResponseError && err.status < 500) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }
    return NextResponse.json({ error: "network" }, { status: 502 });
  }

  const record = pb.authStore.record;
  const sessionEmail = record?.email as string | undefined;
  if (!isEmailAllowed(sessionEmail)) {
    pb.authStore.clear();
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }

  const name =
    (record?.name as string) || sessionEmail?.split("@")[0] || "";

  const res = NextResponse.json({ ok: true, name });
  res.cookies.set(PB_COOKIE, serializeAuth(pb), authCookieOptions);
  return res;
}
