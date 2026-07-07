"use client";

import { useEffect } from "react";

import { registerServiceWorker } from "@/lib/push-client";

/**
 * Registra el service worker de Web Push en silencio al montar (Fase 2,
 * docs/notificaciones-push-plan.md §2.1). No pide permiso todavia -- eso
 * solo pasa cuando el usuario clickea "Activar" en el banner de opt-in o
 * en /perfil/notificaciones. Registrar el SW de antemano no requiere
 * permiso del navegador. Sin UI propia.
 */
export function PushRegistration() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return null;
}
