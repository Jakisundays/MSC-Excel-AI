import { LoginView } from "./login-view";
import { isSafeReturnTo } from "@/lib/return-to";

const KNOWN_ERRORS = new Set(["oauth", "auth", "not_allowed"]);

export const metadata = { title: "Acceso" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error, returnTo } = await searchParams;
  const oauthError = error && KNOWN_ERRORS.has(error) ? (error as "oauth" | "auth" | "not_allowed") : null;

  return (
    <LoginView oauthError={oauthError} returnTo={isSafeReturnTo(returnTo) ? returnTo : null} />
  );
}
