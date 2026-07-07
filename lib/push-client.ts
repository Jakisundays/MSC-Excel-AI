/**
 * Helpers de CLIENTE para Web Push (Fase 2,
 * docs/notificaciones-push-plan.md §2.1). Solo se importan desde
 * componentes cliente -- cada helper hace feature-detection antes de tocar
 * cualquier API del navegador, para degradar en silencio en navegadores
 * sin soporte (Safari viejo, Firefox Android sin permiso, etc).
 */

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (e) {
    console.warn("[push-client] no se pudo registrar el service worker:", e);
    return null;
  }
}

/** Convierte la VAPID public key (base64url) al formato que pide `pushManager.subscribe`. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(vapidPublicKey: string): Promise<boolean> {
  if (!isPushSupported() || Notification.permission === "denied") return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await registerServiceWorker();
  if (!registration) return false;

  let subscription: PushSubscription | null = null;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    const json = subscription.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) {
      throw new Error(`POST /api/push/subscribe respondió ${res.status}`);
    }
    return true;
  } catch (e) {
    console.warn("[push-client] no se pudo suscribir a push:", e);
    // El navegador ya quedó suscripto (pushManager.subscribe() tuvo éxito)
    // pero el servidor nunca se enteró -- revertir para no dejar al usuario
    // creyendo que activó notificaciones que jamás va a recibir (sin esto,
    // no hay forma de reconciliar: el servidor no tiene ninguna fila para
    // este endpoint).
    if (subscription) {
      try {
        await subscription.unsubscribe();
      } catch (unsubError) {
        console.warn(
          "[push-client] no se pudo revertir la suscripción tras fallo del servidor:",
          unsubError,
        );
      }
    }
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  try {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } catch (e) {
    console.warn("[push-client] no se pudo avisar la baja al servidor:", e);
  }

  return subscription.unsubscribe();
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Baja remota de un dispositivo listado en /perfil/notificaciones (no
 * necesariamente el navegador actual -- ej. un dispositivo perdido/robado).
 * Solo avisa al servidor por `id`; no puede llamar `subscription.unsubscribe()`
 * porque esa suscripción vive en otro navegador/dispositivo.
 */
export async function unsubscribeDeviceById(id: string): Promise<boolean> {
  try {
    const res = await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return res.ok;
  } catch (e) {
    console.warn("[push-client] no se pudo dar de baja el dispositivo:", e);
    return false;
  }
}
