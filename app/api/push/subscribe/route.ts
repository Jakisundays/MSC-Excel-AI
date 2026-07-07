import { NextRequest, NextResponse } from "next/server";
import { ClientResponseError } from "pocketbase";

import { getServerPb } from "@/lib/pocketbase/server";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { DEV_PREVIEW } from "@/lib/preview";
import { checkRateLimit } from "@/lib/rate-limit";
import type { PushSubscriptionRecord } from "@/lib/pocketbase/types";

/**
 * Alta/refresco de una suscripción de Web Push (Fase 2,
 * docs/notificaciones-push-plan.md §2.1 y §4). Recibe la forma nativa de
 * `PushSubscription.toJSON()` del navegador. Upsert por `endpoint` (único
 * por dispositivo/navegador) -- el usuario se deriva SIEMPRE de la sesión,
 * nunca del body, mismo patrón de ownership que el resto de rutas API.
 */
export async function POST(req: NextRequest) {
  if (DEV_PREVIEW) {
    return NextResponse.json({ ok: true });
  }

  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const userId = pb.authStore.record!.id;

  if (!checkRateLimit(`push-subscribe:${userId}`, 20, 60_000)) {
    return NextResponse.json({ error: "Demasiados intentos, esperá un momento" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
  }
  if (!isKnownPushEndpoint(endpoint)) {
    return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent") || "";

  // Cliente admin: el lookup de "¿este endpoint ya pertenece a otro usuario?"
  // necesita ver filas ajenas para poder reasignarlas -- getServerPb() está
  // sujeto al listRule (`user = @request.auth.id`), así que con el cliente
  // de sesión esa fila ajena nunca aparece (caso real: mismo navegador
  // compartido entre dos cuentas, el create() posterior choca contra el
  // índice único de `endpoint` y el usuario ve un 500 sin remediación).
  const admin = await getAdminPb();

  let existing: PushSubscriptionRecord | null = null;
  try {
    existing = (await admin
      .collection("push_subscriptions")
      .getFirstListItem(
        admin.filter("endpoint = {:endpoint}", { endpoint }),
      )) as unknown as PushSubscriptionRecord;
  } catch (e) {
    if (!(e instanceof ClientResponseError && e.status === 404)) {
      console.error("[api/push/subscribe] error buscando suscripción existente:", e);
      return NextResponse.json({ error: "No se pudo guardar la suscripción" }, { status: 500 });
    }
  }

  try {
    if (existing && existing.user === userId) {
      await admin.collection("push_subscriptions").update(existing.id, {
        keys_p256dh: p256dh,
        keys_auth: auth,
        user_agent: userAgent,
      });
      return NextResponse.json({ ok: true });
    }

    if (existing && existing.user !== userId) {
      // Mismo navegador, se logueó antes con otra cuenta -- reasignar la
      // fila al usuario actual en vez de borrar+crear (evita el 500 por
      // choque contra el índice único de `endpoint`).
      await admin.collection("push_subscriptions").update(existing.id, {
        user: userId,
        keys_p256dh: p256dh,
        keys_auth: auth,
        user_agent: userAgent,
      });
      return NextResponse.json({ ok: true });
    }

    await admin.collection("push_subscriptions").create({
      user: userId,
      endpoint,
      keys_p256dh: p256dh,
      keys_auth: auth,
      user_agent: userAgent,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/push/subscribe] error guardando suscripción:", e);
    return NextResponse.json({ error: "No se pudo guardar la suscripción" }, { status: 500 });
  }
}

/** VAPID push endpoints conocidos (Chrome/Edge, Firefox, Safari/WebKit). */
function isKnownPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    return [
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
    ].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}
