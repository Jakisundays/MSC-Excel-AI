import { NextRequest, NextResponse } from "next/server";
import { ClientResponseError } from "pocketbase";

import { getServerPb } from "@/lib/pocketbase/server";
import { DEV_PREVIEW } from "@/lib/preview";
import type { PushSubscriptionRecord } from "@/lib/pocketbase/types";

/**
 * Baja explícita de una suscripción de Web Push (Fase 2,
 * docs/notificaciones-push-plan.md §4). Idempotente: si la suscripción ya
 * no existe, no es un error -- ya está dada de baja.
 *
 * Acepta `endpoint` (baja "de este dispositivo", vía subscription.unsubscribe()
 * en el navegador actual) o `id` (baja remota de un dispositivo listado en
 * /perfil/notificaciones -- ese listado nunca expone `endpoint`, solo el id
 * de la fila).
 */
export async function POST(req: NextRequest) {
  if (DEV_PREVIEW) {
    return NextResponse.json({ ok: true });
  }

  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const id = typeof body.id === "string" ? body.id : "";
  if (!endpoint && !id) {
    return NextResponse.json({ error: "Falta endpoint o id" }, { status: 400 });
  }

  const userId = pb.authStore.record!.id;

  let existing: PushSubscriptionRecord | null = null;
  try {
    if (id) {
      existing = (await pb
        .collection("push_subscriptions")
        .getOne(id)) as unknown as PushSubscriptionRecord;
    } else {
      existing = (await pb
        .collection("push_subscriptions")
        .getFirstListItem(
          pb.filter("endpoint = {:endpoint}", { endpoint }),
        )) as unknown as PushSubscriptionRecord;
    }
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 404) {
      return NextResponse.json({ ok: true });
    }
    console.error("[api/push/unsubscribe] error buscando suscripción:", e);
    return NextResponse.json({ error: "No se pudo dar de baja la suscripción" }, { status: 500 });
  }

  if (existing.user !== userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    await pb.collection("push_subscriptions").delete(existing.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/push/unsubscribe] error borrando suscripción:", e);
    return NextResponse.json({ error: "No se pudo dar de baja la suscripción" }, { status: 500 });
  }
}
