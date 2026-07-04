import { NextRequest, NextResponse } from "next/server";
import { getServerPb } from "@/lib/pocketbase/server";
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

  const body = await req.json().catch(() => ({}));
  const record = pb.authStore.record!;

  try {
    const created = await pb.collection("submissions").create({
      user: record.id,
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
    return NextResponse.json({ id: created.id });
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar la solicitud" },
      { status: 500 },
    );
  }
}
