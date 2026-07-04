import "server-only";

import PocketBase from "pocketbase";
import { env } from "@/lib/env";

/**
 * Instancia de PocketBase autenticada como superusuario. Reservada para
 * rutas server-to-server sin sesión de usuario (ej. el webhook de cierre
 * de procesamiento, llamado por el orchestrator) — el resto de la app usa
 * getServerPb() con la cookie del usuario logueado. Nunca exponer estas
 * credenciales fuera de esta función.
 */
export async function getAdminPb(): Promise<PocketBase> {
  const pb = new PocketBase(env.POCKETBASE_URL);
  await pb.collection("_superusers").authWithPassword(
    env.POCKETBASE_ADMIN_EMAIL,
    env.POCKETBASE_ADMIN_PASSWORD,
  );
  return pb;
}
