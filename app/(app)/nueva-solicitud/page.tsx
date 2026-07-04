import { getSession } from "@/lib/auth";
import { NewRequestForm } from "@/components/NewRequestForm";

export const metadata = { title: "Nueva solicitud" };

export default async function NuevaSolicitudPage() {
  const session = await getSession();
  return <NewRequestForm userEmail={session?.email ?? ""} />;
}
