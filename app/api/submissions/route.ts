import { NextRequest, NextResponse } from "next/server";
import {
  getServerPb,
  PB_COOKIE,
  serializeAuth,
  authCookieOptions,
} from "@/lib/pocketbase/server";
import { DEV_PREVIEW } from "@/lib/preview";

/**
 * Registra una solicitud en PocketBase como `pending`, ANTES de llamar al
 * orchestrator (fix de confiabilidad: si el navegador se cierra o pierde
 * red durante la subida, la solicitud ya quedó registrada). El resultado
 * del dispatch se aplica después vía PATCH /api/submissions/[id].
 */
export async function POST(req: NextRequest) {
  if (DEV_PREVIEW) {
    return NextResponse.json({ id: "dev-submission" });
  }

  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // authRefresh: la cookie puede traer un `record` cacheado desde antes de
  // la migración B2B (sin company todavía). submissions.createRule exige
  // @request.body.company = @request.auth.company — sin refrescar acá,
  // una cuenta recién migrada mandaría company="" y PocketBase la
  // rechazaría (su company real ya está en la DB, pero no en esta cookie).
  try {
    await pb.collection("users").authRefresh();
  } catch {
    return NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const record = pb.authStore.record!;

  try {
    const created = await pb.collection("submissions").create({
      user: record.id,
      company: (record.company as string) || "",
      file_a_name: body.file_a_name ?? "",
      file_b_name: body.file_b_name ?? "",
      file_a_size: typeof body.file_a_size === "number" ? body.file_a_size : 0,
      file_b_size: typeof body.file_b_size === "number" ? body.file_b_size : 0,
      sheet_a: body.sheet_a ?? "",
      sheet_b: body.sheet_b ?? "",
      reply_to: Array.isArray(body.reply_to) ? body.reply_to : [],
      orchestrator_request_id: "",
      attachments: [],
      status: "pending",
      error: "",
    });
    const res = NextResponse.json({ id: created.id });
    res.cookies.set(PB_COOKIE, serializeAuth(pb), authCookieOptions);
    return res;
  } catch (err) {
    console.error(
      "[POST /api/submissions]",
      JSON.stringify((err as { response?: unknown })?.response ?? err, null, 2),
    );
    return NextResponse.json(
      { error: "No se pudo guardar la solicitud" },
      { status: 500 },
    );
  }
}
