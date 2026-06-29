import { NextRequest, NextResponse } from "next/server";
import { getServerPb } from "@/lib/pocketbase/server";

/**
 * Registra una solicitud en PocketBase (metadata, sin archivos).
 * Se llama desde el cliente DESPUÉS de subir al orchestrator, con el
 * resultado final (sent/failed). Payload chico → OK en Vercel.
 */
export async function POST(req: NextRequest) {
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
      sheet_a: body.sheet_a ?? "",
      sheet_b: body.sheet_b ?? "",
      reply_to: Array.isArray(body.reply_to) ? body.reply_to : [],
      orchestrator_request_id: body.orchestrator_request_id ?? "",
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      status: body.status ?? "pending",
      error: body.error ?? "",
    });
    return NextResponse.json({ id: created.id });
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo guardar la solicitud" },
      { status: 500 },
    );
  }
}
