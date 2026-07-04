import { getSession } from "@/lib/auth";
import { listSubmissions } from "@/lib/submissions";
import { HistorialView } from "@/components/historial-view";

export const metadata = { title: "Historial" };

export default async function HistorialPage() {
  const session = await getSession();
  const { items, error } = session
    ? await listSubmissions(session.id)
    : { items: [], error: false };

  return <HistorialView items={items} error={error} />;
}
