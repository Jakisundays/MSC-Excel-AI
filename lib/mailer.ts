import "server-only";

import nodemailer from "nodemailer";
import { env } from "@/lib/env";

/**
 * SMTP propio (no hay proveedor transaccional conectado). Si no está
 * configurado, no falla el flujo que lo llama (ej. invitar a un empleado)
 * — solo loguea y sigue, para no bloquear la operación por un email que no
 * pudo salir. `getTransport` es lazy: no abre conexión hasta el primer envío.
 */
let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transport;
}

export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    console.warn(
      `[mailer] SMTP no configurado — no se envió el email a ${opts.to} ("${opts.subject}").`,
    );
    return false;
  }

  try {
    await getTransport().sendMail({
      from: env.SMTP_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
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
