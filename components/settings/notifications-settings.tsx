"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, Laptop, Loader2, X } from "lucide-react";

import {
  getNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  unsubscribeDeviceById,
} from "@/lib/push-client";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";
import { formatDateTime } from "@/lib/format";

type Permission = NotificationPermission | "unsupported";

interface DeviceItem {
  id: string;
  userAgent?: string;
  lastSeenAt: string;
}

/**
 * Panel de "Notificaciones" en /perfil/notificaciones (Fase 2,
 * docs/notificaciones-push-plan.md §2.1). Client component: necesita el
 * permiso real del navegador y la lista de dispositivos suscriptos, que no
 * existen en el server.
 */
export function NotificationsSettings() {
  const [permission, setPermission] = useState<Permission>("default");
  const [working, setWorking] = useState(false);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    setPermission(getNotificationPermission());
    loadDevices();
  }, []);

  async function loadDevices() {
    setLoadingDevices(true);
    try {
      const res = await fetch("/api/push/subscriptions");
      const data = await res.json().catch(() => ({}));
      setDevices(Array.isArray(data.items) ? data.items : []);
    } catch {
      setDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  }

  async function activar() {
    setWorking(true);
    try {
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
      const ok = await subscribeToPush(vapidPublicKey);
      if (ok) {
        toast.success("Notificaciones activadas");
        await loadDevices();
      } else {
        toast.error("No se pudo activar las notificaciones");
      }
    } finally {
      setPermission(getNotificationPermission());
      setWorking(false);
    }
  }

  async function desactivar() {
    setWorking(true);
    try {
      const ok = await unsubscribeFromPush();
      if (ok) {
        toast.success("Notificaciones desactivadas en este dispositivo");
      } else {
        toast.error("No se pudo desactivar las notificaciones");
      }
      await loadDevices();
    } finally {
      setWorking(false);
    }
  }

  async function quitarDispositivo(id: string) {
    setRemovingId(id);
    try {
      const ok = await unsubscribeDeviceById(id);
      if (ok) {
        toast.success("Dispositivo desconectado");
        setDevices((prev) => prev.filter((d) => d.id !== id));
      } else {
        toast.error("No se pudo desconectar el dispositivo");
      }
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      <SettingsCard>
        <div className="flex items-center gap-4">
          <div className="bg-muted text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
            <BellRing className="size-5" aria-hidden />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-medium">Notificaciones del navegador</div>
            <div className="text-muted-foreground mt-0.5 text-[13px]">
              {permission === "granted" &&
                "Activadas. Te avisamos apenas tu solicitud esté lista."}
              {permission === "default" &&
                "Recibí un aviso cuando tu solicitud esté lista, incluso con la pestaña cerrada."}
              {permission === "denied" &&
                "Las bloqueaste desde la configuración del navegador. Para reactivarlas, entrá a los ajustes del sitio en tu navegador (el ícono de candado en la barra de direcciones) y permití las notificaciones."}
              {permission === "unsupported" &&
                "Tu navegador actual no soporta notificaciones push."}
            </div>
          </div>
          {permission === "default" && (
            <Button type="button" onClick={activar} disabled={working} className="shrink-0">
              {working && <Loader2 className="animate-spin" />}
              Activar notificaciones
            </Button>
          )}
          {permission === "granted" && (
            <Button
              type="button"
              variant="secondary"
              onClick={desactivar}
              disabled={working}
              className="shrink-0"
            >
              {working && <Loader2 className="animate-spin" />}
              Desactivar en este dispositivo
            </Button>
          )}
        </div>
      </SettingsCard>

      <SettingsCard className="gap-3">
        <div className="text-base font-medium">Dispositivos con notificaciones activas</div>
        {loadingDevices ? (
          <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Cargando…
          </div>
        ) : devices.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No tenés ningún dispositivo con notificaciones activas.
          </p>
        ) : (
          <div className="flex flex-col">
            {devices.map((d, i) => (
              <div
                key={d.id}
                className={
                  "flex items-center gap-3 py-3" + (i < devices.length - 1 ? " border-b" : "")
                }
              >
                <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
                  <Laptop className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">
                    {d.userAgent || "Dispositivo desconocido"}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Última vez {formatDateTime(d.lastSeenAt)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground shrink-0"
                  disabled={removingId === d.id}
                  onClick={() => quitarDispositivo(d.id)}
                  aria-label="Desconectar dispositivo"
                >
                  {removingId === d.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <X className="size-4" aria-hidden />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      <p className="text-muted-foreground text-[13px]">
        Además de las notificaciones del navegador, siempre te mandamos un correo
        cuando tu solicitud termina o falla.
      </p>
    </>
  );
}
