const ERRORS: Record<string, string> = {
  oauth: "No se pudo iniciar el login. Intentá de nuevo.",
  auth: "Falló la autenticación con Google.",
  not_allowed: "Esa cuenta no tiene acceso a esta herramienta.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERRORS[error] ?? "Ocurrió un error." : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            MSC Excel AI
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Procesamiento de archivos Excel con apoyo de IA
          </p>
        </div>

        {message && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {message}
          </div>
        )}

        <a
          href="/api/auth/login"
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-medium shadow-sm transition hover:bg-[var(--color-surface)]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"
            />
          </svg>
          Continuar con Google
        </a>

        <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
          Acceso restringido al equipo autorizado.
        </p>
      </div>
    </main>
  );
}
