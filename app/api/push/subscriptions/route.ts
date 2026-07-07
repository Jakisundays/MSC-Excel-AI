import { NextResponse } from "next/server";

import { getServerPb } from "@/lib/pocketbase/server";
import { DEV_PREVIEW } from "@/lib/preview";
import type { PushSubscriptionRecord } from "@/lib/pocketbase/types";

/**
 * Lista "mis dispositivos" con notificaciones push activas (Fase 2,
 * docs/notificaciones-push-plan.md §4), para mostrar en /perfil. Nunca
 * devuelve `endpoint`/`keys` -- son credenciales sensibles de la
 * suscripción push, solo hacen falta server-side.
 */
export async function GET() {
  if (DEV_PREVIEW) {
    return NextResponse.json({ items: [] });
  }

  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const userId = pb.authStore.record!.id;

  try {
    const items = (await pb.collection("push_subscriptions").getFullList({
      filter: pb.filter("user = {:u}", { u: userId }),
      sort: "-last_seen_at",
    })) as unknown as PushSubscriptionRecord[];

    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        userAgent: item.user_agent,
        lastSeenAt: item.last_seen_at,
      })),
    });
  } catch (e) {
    console.error("[api/push/subscriptions] error listando suscripciones:", e);
    return NextResponse.json({ error: "No se pudieron cargar los dispositivos" }, { status: 500 });
  }
}
