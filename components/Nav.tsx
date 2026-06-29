import Link from "next/link";

export function Nav({ email }: { email: string }) {
  return (
    <header className="border-b border-[var(--color-border)]">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
            MSC Excel AI
          </Link>
          <nav className="flex gap-4 text-sm text-[var(--color-muted)]">
            <Link href="/nueva-solicitud" className="hover:text-[var(--color-fg)]">
              Nueva solicitud
            </Link>
            <Link href="/historial" className="hover:text-[var(--color-fg)]">
              Historial
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-[var(--color-muted)] sm:inline">
            {email}
          </span>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm transition hover:bg-[var(--color-surface)]"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
