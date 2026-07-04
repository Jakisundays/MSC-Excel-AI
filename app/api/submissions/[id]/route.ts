import { NextRequest, NextResponse } from "next/server";
import { ClientResponseError } from "pocketbase";

import { getServerPb } from "@/lib/pocketbase/server";
import { DEV_PREVIEW } from "@/lib/preview";

/**
 * Aplica el resultado del dispatch al orchestrator sobre una solicitud ya
 * creada como `pending` (ver POST /api/submissions). Solo mueve el estado
 * a `processing` (dispatch OK) o `failed` (dispatch falló) — el cierre a
 * `completed`/`failed` final llega por el webhook de resultado, que escribe
 * con credenciales de superusuario, no por esta ruta.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (DEV_PREVIEW) {
    return NextResponse.json({ ok: true });
  }

  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (body.status !== "processing" && body.status !== "failed") {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  try {
    const updated = await pb.collection("submissions").update(id, {
      status: body.status,
      orchestrator_request_id: body.orchestrator_request_id ?? "",
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      error: body.error ?? "",
      ...(body.status === "processing"
        ? { processing_started_at: new Date().toISOString() }
        : {}),
    });
    return NextResponse.json({ id: updated.id });
  } catch (e) {
    const status = e instanceof ClientResponseError ? e.status : 500;
    return NextResponse.json(
      { error: "No se pudo actualizar la solicitud" },
      { status: status === 404 || status === 403 ? status : 500 },
    );
  }
}
