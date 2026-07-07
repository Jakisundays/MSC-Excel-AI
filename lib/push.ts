import "server-only";

import webpush from "web-push";
import type PocketBase from "pocketbase";

import { env } from "@/lib/env";
import type { PushSubscriptionRecord } from "@/lib/pocketbase/types";

/**
 * Web Push (Fase 2 del plan, docs/notificaciones-push-plan.md). Requiere
 * un par de claves VAPID configuradas (ver lib/env.ts) -- si no están, el
 * feature degrada en silencio: no manda nada todavía, sin romper el resto
 * de canales de notifySubmissionResult() (lib/notify.ts).
 */
export function isPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

/**
 * Manda un Web Push a TODAS las suscripciones activas del usuario. Nunca
 * tira: cualquier error se loguea y se absorbe acá, el llamador
 * (notifySubmissionResult) ya asume que este canal puede fallar sin
 * afectar el resto.
 */
export async function sendPushToUser(
  pb: PocketBase,
  userId: string,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  try {
    if (!isPushConfigured()) {
      console.warn("[push] VAPID no configurado, se omite el envío de Web Push.");
      return;
    }

    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

    const subs = (await pb.collection("push_subscriptions").getFullList({
      filter: pb.filter("user = {:u}", { u: userId }),
    })) as unknown as PushSubscriptionRecord[];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
          },
          JSON.stringify(payload),
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Suscripción muerta (revocada por el navegador/usuario) -- autolimpieza.
          try {
            await pb.collection("push_subscriptions").delete(sub.id);
          } catch (deleteErr) {
            console.error(
              `[push] no se pudo borrar la suscripción muerta ${sub.id}:`,
              deleteErr instanceof Error ? deleteErr.message : deleteErr,
            );
          }
        } else {
          console.error(
            `[push] error enviando a la suscripción ${sub.id} (statusCode ${statusCode ?? "?"}):`,
            err instanceof Error ? err.message : err,
          );
        }
        // Un fallo en una suscripción no debe frenar las demás.
      }
    }
  } catch (err) {
    console.error(
      `[push] error inesperado enviando Web Push al usuario ${userId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
