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
}): Promise<string> {
  const secret = new TextEncoder().encode(env.UPLOAD_TICKET_SECRET);
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}
