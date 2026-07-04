import { NextRequest, NextResponse } from "next/server";
import { ClientResponseError } from "pocketbase";

import {
  getServerPb,
  PB_COOKIE,
  serializeAuth,
  authCookieOptions,
} from "@/lib/pocketbase/server";

const TEXT_FIELDS = ["first_name", "last_name", "phone", "city", "birth_date", "address"] as const;

/** Actualiza el perfil del usuario autenticado (datos + foto opcional). */
export async function POST(req: NextRequest) {
  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const userId = pb.authStore.record!.id;

  const incoming = await req.formData();
  const fd = new FormData();

  for (const field of TEXT_FIELDS) {
    const v = incoming.get(field);
    fd.append(field, typeof v === "string" ? v.trim() : "");
  }

  const firstName = String(incoming.get("first_name") ?? "").trim();
  const lastName = String(incoming.get("last_name") ?? "").trim();
  fd.append("name", `${firstName} ${lastName}`.trim());

  if (incoming.get("remove_avatar") === "1") {
    fd.append("avatar", "");
  } else {
    const avatar = incoming.get("avatar");
    if (avatar instanceof File && avatar.size > 0) {
      fd.append("avatar", avatar);
    }
  }

  try {
    const updated = await pb.collection("users").update(userId, fd);
    pb.authStore.save(pb.authStore.token, updated);
  } catch (e) {
    const message =
      e instanceof ClientResponseError ? e.message : "No se pudo actualizar el perfil.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PB_COOKIE, serializeAuth(pb), authCookieOptions);
  return res;
}
