import "server-only";

import { SignJWT } from "jose";
import { env } from "@/lib/env";

/**
 * "Upload ticket": JWT corto (HS256) que autoriza la subida directa
 * del navegador al orchestrator. El email viaja firmado, por lo que
 * el orchestrator lo usa como destinatario (identidad verificada).
 */
export async function signUploadTicket(claims: {
  sub: string;
  email: string;
  /**
   * Solo propagación de dato para que el webhook de cierre pueda etiquetar
   * submissions.company sin volver a resolverlo — NO es un gate de
   * seguridad: orchestrator/auth.py únicamente valida firma+exp y no
   * consulta ninguna base de datos, así que nunca hay que asumir que este
   * claim fue verificado contra el estado real de la suscripción.
   */
  companyId?: string;
}): Promise<string> {
  const secret = new TextEncoder().encode(env.UPLOAD_TICKET_SECRET);
  return new SignJWT({ email: claims.email, companyId: claims.companyId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}
