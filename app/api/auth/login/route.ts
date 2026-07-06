import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { env } from "@/lib/env";
import { isSafeReturnTo } from "@/lib/return-to";

type OAuthProvider = {
  name: string;
  authURL: string;
  codeVerifier: string;
  state: string;
};

/** Forma de listAuthMethods() según la versión del SDK/servidor de PocketBase. */
type ListAuthMethodsResponse = {
  oauth2?: { providers?: OAuthProvider[] };
  authProviders?: OAuthProvider[];
};

/**
 * Inicia el login con Google (OAuth2 authorization-code, ideal para SSR):
 * pide los providers a PocketBase, guarda codeVerifier+state en cookies
 * temporales y redirige a Google.
 */
export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get("returnTo");

  const pb = new PocketBase(env.POCKETBASE_URL);

  const methods =
    (await pb.collection("users").listAuthMethods()) as unknown as ListAuthMethodsResponse;
  // Compatibilidad entre versiones del SDK:
  // nuevo: methods.oauth2.providers ; viejo: methods.authProviders
  const providers = methods.oauth2?.providers ?? methods.authProviders ?? [];
  const google = providers.find((p) => p.name === "google");

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
  if (isSafeReturnTo(returnTo)) {
    res.cookies.set("pb_oauth_return_to", returnTo, opts);
  }
  return res;
}
