import Link from "next/link";

import { getSession } from "@/lib/auth";
import { AcceptInvitationView } from "./accept-invitation-view";

export const metadata = { title: "Aceptar invitación" };

export default async function AceptarInvitacionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const session = await getSession();
  const returnTo = token ? `/invitaciones/aceptar?token=${encodeURIComponent(token)}` : "";
  const loginHref = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="bg-card w-full max-w-sm rounded-2xl border p-8 text-center">
        <h1 className="text-lg font-medium">Invitación a una empresa</h1>

        {!token ? (
          <p className="text-muted-foreground mt-3 text-sm">
            Este link no incluye una invitación válida. Pedile a quien te invitó que te reenvíe el email.
          </p>
        ) : !session ? (
          <>
            <p className="text-muted-foreground mt-3 text-sm text-pretty">
              Iniciá sesión (o creá tu cuenta) con el mismo email al que llegó la invitación y volvé a
              abrir este link para aceptarla.
            </p>
            <Link
              href={loginHref}
              className="text-primary mt-4 inline-block text-sm font-medium underline underline-offset-4"
            >
              Ir a iniciar sesión
            </Link>
          </>
        ) : (
          <div className="mt-5">
            <p className="text-muted-foreground mb-4 text-sm">
              Estás por unirte a una empresa como <strong>{session.email}</strong>.
            </p>
            <AcceptInvitationView token={token} />
          </div>
        )}
      </div>
    </div>
  );
}
