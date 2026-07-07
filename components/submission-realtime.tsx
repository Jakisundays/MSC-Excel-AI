"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refresco liviano para el detalle de una solicitud mientras su estado no
 * sea terminal. No usamos el realtime nativo de PocketBase (SSE) porque
 * requeriría exponer el token de sesión (hoy httpOnly, ver
 * lib/pocketbase/server.ts) a JS del cliente para autenticar la
 * suscripción — un trade-off de seguridad que no vale la pena para esta
 * mejora de UX. Se pausa con la Page Visibility API mientras el tab no está
 * visible, para no gastar requests ni batería en pestañas de fondo.
 */
export function SubmissionRealtime({
  submissionId,
  skip,
}: {
  submissionId: string;
  skip: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (skip) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (interval) return;
      interval = setInterval(() => router.refresh(), 5000);
    }

    function stop() {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stop();
      } else {
        router.refresh();
        start();
      }
    }

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stop();
    };
  }, [skip, router, submissionId]);

  return null;
}
