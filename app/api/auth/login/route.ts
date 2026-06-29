import { NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { env } from "@/lib/env";

/**
 * Inicia el login con Google (OAuth2 authorization-code, ideal para SSR):
 * pide los providers a PocketBase, guarda codeVerifier+state en cookies
 * temporales y redirige a Google.
 */
export async function GET() {
  const pb = new PocketBase(env.POCKETBASE_URL);

  const methods = await pb.collection("users").listAuthMethods();
  // Compatibilidad entre versiones del SDK:
  // nuevo: methods.oauth2.providers ; viejo: methods.authProviders
  const providers =
    (methods as any).oauth2?.providers ??
    (methods as any).authProviders ??
    [];
  const google = providers.find((p: any) => p.name === "google");

  if (!google) {
    return NextResponse.json(
      { error: "Google OAuth no está configurado en PocketBase." },
      { status: 500 },
    );
  }

  const redirectUrl = `${env.APP_URL}/api/auth/callback`;
  const authUrl = google.authURL + encodeURIComponent(redirectUrl);

  const res = NextResponse.redirect(authUrl);
  const opts = {
    httpOnly: true,
    secure: env.IS_PROD,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 min para completar el OAuth
  };
  res.cookies.set("pb_oauth_verifier", google.codeVerifier, opts);
  res.cookies.set("pb_oauth_state", google.state, opts);
  res.cookies.set("pb_oauth_provider", google.name, opts);
  return res;
}
