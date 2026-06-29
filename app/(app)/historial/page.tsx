import { getServerPb } from "@/lib/pocketbase/server";
import type { SubmissionRecord } from "@/lib/pocketbase/types";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
};

function fmt(date: string): string {
  try {
    return new Date(date).toLocaleString("es-AR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return date;
  }
}

export default async function HistorialPage() {
  const pb = await getServerPb();

  let items: SubmissionRecord[] = [];
  let loadError = false;
  try {
    const res = await pb.collection("submissions").getList(1, 50, {
      sort: "-created",
      filter: `user = "${pb.authStore.record?.id}"`,
    });
    items = res.items as unknown as SubmissionRecord[];
  } catch {
    loadError = true;
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold tracking-tight">Historial</h1>

      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          No se pudo cargar el historial. Verificá que la colección
          <code className="mx-1 rounded bg-white px-1">submissions</code>
          exista en PocketBase.
        </div>
      )}

      {!loadError && items.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">
          Todavía no enviaste solicitudes.
        </p>
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-xs text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-4 py-2.5 font-medium">Archivos</th>
                <th className="px-4 py-2.5 font-medium">Hojas</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-[var(--color-border)]"
                >
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {fmt(s.created)}
                  </td>
                  <td className="px-4 py-3">
                    <div>{s.file_a_name}</div>
                    <div className="text-[var(--color-muted)]">
                      {s.file_b_name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {s.sheet_a} · {s.sheet_b}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${
                        STATUS_STYLES[s.status] ?? STATUS_STYLES.pending
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
