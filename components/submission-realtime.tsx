"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refresco liviano para el detalle de una solicitud mientras su estado no
 * sea terminal. No usamos el realtime nativo de PocketBase (SSE) porque
 * requeriría exponer el token de sesión (hoy httpOnly, ver
 * lib/pocketbase/server.ts) a JS del cliente para autenticar la
 * suscripción — un trade-off de seguridad que no vale la pena para esta
 * mejora de UX.
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
    const interval = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(interval);
  }, [skip, router, submissionId]);

  return null;
}
