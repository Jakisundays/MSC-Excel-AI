import Link from "next/link";
import { getServerPb } from "@/lib/pocketbase/server";

export default async function DashboardPage() {
  const pb = await getServerPb();
  const name =
    (pb.authStore.record?.name as string) ||
    (pb.authStore.record?.email as string)?.split("@")[0] ||
    "";

  let total = 0;
  try {
    const res = await pb.collection("submissions").getList(1, 1, {
      filter: `user = "${pb.authStore.record?.id}"`,
    });
    total = res.totalItems;
  } catch {
    // colección aún no creada o sin datos
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">
        Hola{name ? `, ${name}` : ""}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Subí dos archivos Excel, elegí una hoja por archivo y enviá la
        solicitud al equipo de procesamiento.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/nueva-solicitud"
          className="rounded-xl border border-[var(--color-border)] bg-white p-5 transition hover:bg-[var(--color-surface)]"
        >
          <div className="text-sm font-medium">Nueva solicitud</div>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Cargar archivos y enviar a procesamiento.
          </p>
        </Link>

        <Link
          href="/historial"
          className="rounded-xl border border-[var(--color-border)] bg-white p-5 transition hover:bg-[var(--color-surface)]"
        >
          <div className="text-sm font-medium">Historial</div>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {total} {total === 1 ? "solicitud enviada" : "solicitudes enviadas"}.
          </p>
        </Link>
      </div>
    </div>
  );
}
