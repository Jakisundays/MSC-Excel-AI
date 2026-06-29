import { redirect } from "next/navigation";
import { getServerPb } from "@/lib/pocketbase/server";
import { Nav } from "@/components/Nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    redirect("/login");
  }
  const email = (pb.authStore.record?.email as string) ?? "";

  return (
    <>
      <Nav email={email} />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </>
  );
}
