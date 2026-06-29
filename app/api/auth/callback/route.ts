import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { env, isEmailAllowed } from "@/lib/env";
import {
  PB_COOKIE,
  serializeAuth,
  authCookieOptions,
} from "@/lib/pocketbase/server";

/** Callback del OAuth: intercambia el code, valida allowlist y setea la sesión. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const verifier = req.cookies.get("pb_oauth_verifier")?.value;
  const savedState = req.cookies.get("pb_oauth_state")?.value;
  const provider = req.cookies.get("pb_oauth_provider")?.value || "google";

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, env.APP_URL));

  if (!code || !state || !verifier || state !== savedState) {
    return fail("oauth");
  }

  const pb = new PocketBase(env.POCKETBASE_URL);
  const redirectUrl = `${env.APP_URL}/api/auth/callback`;

  try {
    await pb.collection("users").authWithOAuth2Code(
      provider,
      code,
      verifier,
      redirectUrl,
    );
  } catch {
    return fail("auth");
  }

  const email = pb.authStore.record?.email as string | undefined;
  if (!isEmailAllowed(email)) {
    pb.authStore.clear();
    return fail("not_allowed");
  }

  const res = NextResponse.redirect(new URL("/dashboard", env.APP_URL));
  res.cookies.set(PB_COOKIE, serializeAuth(pb), authCookieOptions);
  // limpiar cookies temporales del OAuth
  res.cookies.delete("pb_oauth_verifier");
  res.cookies.delete("pb_oauth_state");
  res.cookies.delete("pb_oauth_provider");
  return res;
}
