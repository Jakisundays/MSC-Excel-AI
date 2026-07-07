import { NextRequest, NextResponse } from "next/server";
import { ClientResponseError } from "pocketbase";

import { getServerPb } from "@/lib/pocketbase/server";
import { DEV_PREVIEW } from "@/lib/preview";
import type { NotificationRecord, SubmissionRecord } from "@/lib/pocketbase/types";

/**
 * Centro de notificaciones in-app (Fase 1, docs/notificaciones-push-plan.md
 * §2.1 y §10). Lista/pagina las notificaciones del usuario autenticado y
 * permite marcarlas como leídas. La colección `notifications` ya tiene
 * `listRule`/`viewRule` = `user = @request.auth.id` y su `updateRule` solo
 * permite tocar `read_at` (el resto de los campos queda bloqueado con
 * `:isset = false`) -- alcanza con el cliente de sesión normal, no hace
 * falta cliente admin.
 */
export async function GET() {
  if (DEV_PREVIEW) {
    return NextResponse.json({ items: [], unreadCount: 0 });
  }

  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const userId = pb.authStore.record!.id;

  try {
    const list = await pb.collection("notifications").getList(1, 20, {
      filter: pb.filter("user = {:u}", { u: userId }),
      sort: "-created",
      expand: "submission",
    });

    const unread = await pb.collection("notifications").getList(1, 1, {
      filter: pb.filter("user = {:u} && read_at = ''", { u: userId }),
    });

    const items = (list.items as unknown as NotificationRecord[]).map((item) => {
      const submission = (
        item as unknown as { expand?: { submission?: SubmissionRecord } }
      ).expand?.submission;
      return {
        id: item.id,
        type: item.type,
        read: !!item.read_at,
        submissionId: item.submission,
        created: item.created,
        fileLabel: submission
          ? `${submission.file_a_name} / ${submission.file_b_name}`
          : undefined,
      };
    });

    return NextResponse.json({ items, unreadCount: unread.totalItems });
  } catch (e) {
    console.error("[api/notifications] error listando notificaciones:", e);
    return NextResponse.json({ error: "No se pudieron cargar las notificaciones" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (DEV_PREVIEW) {
    return NextResponse.json({ ok: true });
  }

  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const userId = pb.authStore.record!.id;
  const body = await req.json().catch(() => ({}));
  const nowIso = new Date().toISOString();

  if (body.markAllRead) {
    try {
      const unread = await pb.collection("notifications").getFullList({
        filter: pb.filter("user = {:u} && read_at = ''", { u: userId }),
      });
      for (const n of unread) {
        try {
          await pb.collection("notifications").update(n.id, { read_at: nowIso });
        } catch (e) {
          // No interrumpir el resto del lote por un fallo puntual.
          console.error("[api/notifications] no se pudo marcar como leída", n.id, e);
        }
      }
      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error("[api/notifications] error listando no leídas:", e);
      return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
    }
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  // Defensa en profundidad: no confiar solo en la API rule de PocketBase
  // para bloquear que un usuario marque como leída una notificación ajena.
  // Mismo patrón que app/api/submissions/[id]/route.ts.
  try {
    const existing = await pb.collection("notifications").getOne(id);
    if (existing.user !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  } catch (e) {
    const status = e instanceof ClientResponseError ? e.status : 500;
    return NextResponse.json(
      { error: "No se pudo actualizar la notificación" },
      { status: status === 404 ? 404 : 500 },
    );
  }

  try {
    await pb.collection("notifications").update(id, { read_at: nowIso });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof ClientResponseError ? e.status : 500;
    return NextResponse.json(
      { error: "No se pudo actualizar la notificación" },
      { status: status === 404 || status === 403 ? status : 500 },
    );
  }
}
