import "server-only";

import { env } from "@/lib/env";

/**
 * No hay SMTP propio en Next.js: reusa el mismo SMTP ya configurado en el
 * orchestrator de verito (server-to-server, POST /send-invitation-email),
 * en vez de duplicar credenciales en Vercel. Si el orchestrator no
 * responde o el secreto no está configurado, no falla el flujo que lo
 * llama (ej. invitar a un empleado) — solo loguea y sigue.
 */
export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!env.ORCHESTRATOR_URL || !env.INVITATION_EMAIL_SECRET) {
    console.warn(
      `[mailer] ORCHESTRATOR_URL/INVITATION_EMAIL_SECRET no configurados — no se envió el email a ${opts.to} ("${opts.subject}").`,
    );
    return false;
  }

  try {
    const res = await fetch(`${env.ORCHESTRATOR_URL}/send-invitation-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": env.INVITATION_EMAIL_SECRET,
      },
      body: JSON.stringify({ to: [opts.to], subject: opts.subject, body_html: opts.html }),
    });
    if (!res.ok) {
      console.error(`[mailer] orchestrator devolvió ${res.status} enviando a ${opts.to}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[mailer] falló el envío a ${opts.to}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export function invitationEmailHtml(params: {
  companyName: string;
  inviterEmail: string;
  acceptUrl: string;
}): string {
  return `
    <p>Hola,</p>
    <p><strong>${escapeHtml(params.inviterEmail)}</strong> te invitó a sumarte a
    <strong>${escapeHtml(params.companyName)}</strong> en MSC Excel AI.</p>
    <p><a href="${params.acceptUrl}">Aceptar invitación</a></p>
    <p style="color:#666;font-size:13px">Este link vence en 7 días. Si no esperabas esta invitación, podés ignorar este correo.</p>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
