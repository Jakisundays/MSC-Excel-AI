import "server-only";

import { getServerPb } from "@/lib/pocketbase/server";
import { DEV_PREVIEW, FAKE_USER } from "@/lib/preview";

export interface Session {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  birthDate: string;
  address: string;
  avatarUrl: string;
  created: string;
  updated: string;
}

/** Sesión actual del request (real desde PocketBase, o fake en dev preview). */
export async function getSession(): Promise<Session | null> {
  if (DEV_PREVIEW) {
    return {
      ...FAKE_USER,
      firstName: "",
      lastName: "",
      phone: "",
      city: "",
      birthDate: "",
      address: "",
      avatarUrl: "",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
  }

  const pb = await getServerPb();
  if (!pb.authStore.isValid) return null;

  const r = pb.authStore.record!;
  const email = (r.email as string) ?? "";
  const avatar = (r.avatar as string) ?? "";

  return {
    id: r.id,
    email,
    name: (r.name as string) || email.split("@")[0] || "",
    firstName: (r.first_name as string) ?? "",
    lastName: (r.last_name as string) ?? "",
    phone: (r.phone as string) ?? "",
    city: (r.city as string) ?? "",
    birthDate: (r.birth_date as string) ?? "",
    address: (r.address as string) ?? "",
    avatarUrl: avatar ? pb.files.getURL(r, avatar) : "",
    created: (r.created as string) ?? "",
    updated: (r.updated as string) ?? "",
  };
}
