"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, X } from "lucide-react";

import {
  getNotificationPermission,
  isPushSupported,
  subscribeToPush,
} from "@/lib/push-client";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";

const DISMISSED_KEY = "msc-push-banner-dismissed";

/**
 * Banner de opt-in de Web Push (Fase 2, docs/notificaciones-push-plan.md
 * §2.1 y §3). Solo se muestra cuando el navegador soporta Push, el usuario
 * nunca contestó al prompt de permiso ("default"), y no lo descartó antes
 * en este mismo navegador.
 */
export function NotificationOptInBanner() {
  const [visible, setVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    if (getNotificationPermission() !== "default") return;
    if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
    setVisible(true);
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  async function activar() {
    setSubscribing(true);
    try {
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
      const ok = await subscribeToPush(vapidPublicKey);
      if (ok) {
        toast.success("Notificaciones activadas", {
          description: "Te vamos a avisar apenas tu solicitud esté lista.",
        });
      } else {
        toast.error("No se pudo activar las notificaciones");
      }
    } finally {
      setSubscribing(false);
      dismiss();
    }
  }

  if (!visible) return null;

  return (
    <SettingsCard className="flex-col items-stretch gap-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-4">
        <div className="bg-muted text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
          <Bell className="size-5" aria-hidden />
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-medium">Activá las notificaciones</div>
          <div className="text-muted-foreground mt-0.5 text-[13px]">
            Recibí un aviso cuando tu solicitud esté lista, incluso si cerrás esta
            pestaña.
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="ghost" onClick={dismiss} disabled={subscribing}>
          Ahora no
        </Button>
        <Button type="button" onClick={activar} disabled={subscribing}>
          Activar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={dismiss}
          disabled={subscribing}
          aria-label="Descartar"
          className="sm:hidden"
        >
          <X />
        </Button>
      </div>
    </SettingsCard>
  );
}
