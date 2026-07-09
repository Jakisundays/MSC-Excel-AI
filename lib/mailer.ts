import "server-only";

import { env } from "@/lib/env";
import { getAdminPb } from "@/lib/pocketbase/admin";
import type { SubmissionRecord } from "@/lib/pocketbase/types";

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

export interface ResultEmailAttached {
  original_1: boolean;
  original_2: boolean;
  result_file: boolean;
}

/**
 * Email de resultado de una submission COMPLETADA, con los 3 adjuntos en
 * el orden original_1/original_2/result_file (ver POST /send-result-email
 * en el orchestrator) -- a diferencia de sendMail(), que no soporta
 * adjuntos en absoluto (pega contra /send-invitation-email, que usa
 * SimpleEmailInfo sin adjuntos). Llamada SOLO desde
 * lib/notify.ts::notifySubmissionResult() para "submission_completed" --
 * failed/timeout siguen usando sendMail()/submissionResultEmailHtml() sin
 * adjuntos.
 *
 * Destinatarios: `params.to` debe ser `submission.reply_to` (los
 * destinatarios configurados por el usuario en "Nueva solicitud"), NO
 * `user.email` -- ver docstring de notifySubmissionResult().
 *
 * Nunca tira: cualquier fallo (fetch a PocketBase, red al orchestrator,
 * respuesta no-2xx) se loguea con console.error y devuelve `{ ok: false }`,
 * mismo criterio que sendMail().
 */
export async function sendResultEmailWithAttachments(params: {
  to: string[];
  subject: string;
  bodyHtml: string;
  submission: SubmissionRecord;
}): Promise<{ ok: boolean; attached?: ResultEmailAttached }> {
  const { to, subject, bodyHtml, submission } = params;

  if (to.length === 0) {
    console.error(
      `[mailer] sendResultEmailWithAttachments: submission ${submission.id} no tiene destinatarios (reply_to vacío) — no se envía nada.`,
    );
    return { ok: false };
  }
  if (!submission.result_file) {
    // Defensivo: no debería pasar si status=completed (el webhook de
    // cierre exige result_file para marcar completed), pero sin esto no
    // hay nada que mandar.
    console.error(
      `[mailer] sendResultEmailWithAttachments: submission ${submission.id} no tiene result_file (status=completed sin archivo) — no se envía nada.`,
    );
    return { ok: false };
  }
  if (!env.ORCHESTRATOR_URL || !env.INVITATION_EMAIL_SECRET) {
    console.warn(
      `[mailer] ORCHESTRATOR_URL/INVITATION_EMAIL_SECRET no configurados — no se envió el email de resultado de la submission ${submission.id}.`,
    );
    return { ok: false };
  }

  try {
    const adminPb = await getAdminPb();
    // pb.files.getURL() necesita el RecordModel completo (collectionId/
    // collectionName incluidos) para armar la URL — el `submission` que
    // recibe esta función puede venir de un merge parcial (ver
    // app/api/webhooks/processing-result/route.ts), así que se relee el
    // record real antes de pedir las URLs de archivo.
    const record = await adminPb.collection("submissions").getOne(submission.id);

    const form = new FormData();
    for (const recipient of to) {
      form.append("to", recipient);
    }
    form.append("subject", subject);
    form.append("body_html", bodyHtml);

    let attachedOriginal1 = false;
    if (submission.original_file_a) {
      const blob = await fetchPbFileBlob(adminPb, record, submission.original_file_a, submission.id, "original_file_a");
      if (blob) {
        form.append("original_1", blob, submission.file_a_name || "Original 1.xlsx");
        attachedOriginal1 = true;
      }
    }

    let attachedOriginal2 = false;
    if (submission.original_file_b) {
      const blob = await fetchPbFileBlob(adminPb, record, submission.original_file_b, submission.id, "original_file_b");
      if (blob) {
        form.append("original_2", blob, submission.file_b_name || "Original 2.xlsx");
        attachedOriginal2 = true;
      }
    }

    const resultBlob = await fetchPbFileBlob(adminPb, record, submission.result_file, submission.id, "result_file");
    if (!resultBlob) {
      // result_file es obligatorio: sin él no tiene sentido llamar al
      // orchestrator (violaría su propia validación de campo requerido).
      return { ok: false };
    }
    form.append("result_file", resultBlob, submission.result_file_name || "Resultado.xlsx");

    console.log(
      `[mailer] sendResultEmailWithAttachments: submission ${submission.id} — adjuntando original_1=${attachedOriginal1} original_2=${attachedOriginal2} result_file=true, enviando a ${to.length} destinatario(s).`,
    );

    const res = await fetch(`${env.ORCHESTRATOR_URL}/send-result-email`, {
      method: "POST",
      headers: { "X-Api-Key": env.INVITATION_EMAIL_SECRET },
      body: form,
    });
    if (!res.ok) {
      console.error(
        `[mailer] orchestrator devolvió ${res.status} enviando el email de resultado de la submission ${submission.id}`,
      );
      return { ok: false };
    }

    const json = (await res.json()) as { ok: boolean; attached?: ResultEmailAttached };
    return { ok: json.ok, attached: json.attached };
  } catch (err) {
    console.error(
      `[mailer] falló el envío del email de resultado de la submission ${submission.id}:`,
      err instanceof Error ? err.message : err,
    );
    return { ok: false };
  }
}

/** Baja los bytes reales de un archivo de PocketBase (campo `protected: false`,
 * fetcheable directo sin token) como Blob, listo para FormData.append(). `null`
 * ante cualquier fallo (loguea y sigue -- ver llamadores). */
async function fetchPbFileBlob(
  pb: Awaited<ReturnType<typeof getAdminPb>>,
  record: Parameters<typeof pb.files.getURL>[0],
  filename: string,
  submissionId: string,
  fieldLabel: string,
): Promise<Blob | null> {
  try {
    const url = pb.files.getURL(record, filename);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(
        `[mailer] no se pudo bajar ${fieldLabel} de la submission ${submissionId}: HTTP ${res.status}`,
      );
      return null;
    }
    return await res.blob();
  } catch (err) {
    console.error(
      `[mailer] error bajando ${fieldLabel} de la submission ${submissionId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Paleta y tipografía calcadas de la identidad de marca de la app (ver
 * app/globals.css, componente components/logo.tsx): mismo verde de acción,
 * mismas superficies "forest", mismo mark de 4 celdas. Un email transaccional
 * no hereda el theming claro/oscuro del producto (mismo criterio que
 * Stripe/Linear: `color-scheme: light` fijo) — así el contraste calculado a
 * mano no se rompe si el cliente de correo del destinatario está en oscuro.
 */
const BRAND = {
  panel: "#10271a", // --brand-panel
  panelMuted1: "#617068", // rgba(255,255,255,.34) del logo, resuelta sobre --brand-panel (Outlook no soporta rgba en bgcolor)
  panelMuted2: "#364a3f", // rgba(255,255,255,.16) del logo, resuelta sobre --brand-panel
  gold: "#d7ac6e", // --chart-2, celda acentuada del logo
  primary: "#0a8d43", // --primary
  primaryDark: "#087a3a", // hover/active del botón
  success: "#0e9c4a", // --success (components/status-badge.tsx: bg-success/10 text-success)
  successSoft: "#e7f5ed", // --success al 10% resuelto sobre blanco, mismo tono que bg-success/10
  destructive: "#c0392b", // --destructive (components/status-badge.tsx: bg-destructive/10 text-destructive)
  destructiveSoft: "#f9ebea", // --destructive al 10% resuelto sobre blanco
  foreground: "#1d3d2c", // --foreground
  muted: "#5b6b62", // variante de --muted-foreground con más contraste sobre blanco puro
  background: "#eff5f0", // --background
  card: "#ffffff", // --card
  border: "#dde9df", // --border
};

/** Escape mínimo para el atributo `href` (defensa en profundidad — ver
 * lib/company.ts::sendInvitationEmail, `acceptUrl` ya es 100% construida en
 * servidor, esto solo cubre el caso de que eso cambie a futuro). */
function escapeAttr(value: string): string {
  return value.replace(/"/g, "%22");
}

/**
 * Botón CTA con fallback VML "bulletproof" (Outlook clásico no renderiza
 * `border-radius`/`background-color` de un `<a>` de forma confiable).
 */
function ctaButton(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="border-radius:10px;background-color:${BRAND.primary};">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:50px;v-text-anchor:middle;width:230px;" arcsize="20%" strokecolor="${BRAND.primary}" fillcolor="${BRAND.primary}">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:700;">${label}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${url}" class="btn-cta" target="_blank" style="display:inline-block;padding:15px 30px;font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;background-color:${BRAND.primary};border-radius:10px;">
            ${label}
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>`;
}

/**
 * Badge circular de estado (check/cruz), mismo criterio de color que
 * components/status-badge.tsx en el producto (success/destructive, nunca un
 * tono nuevo fuera de esos dos + el verde de acción). Se arma con celdas de
 * tabla y un glifo de texto simple (✓/✕, sin variation selector de emoji)
 * en vez de un ícono real: ningún cliente de correo garantiza SVG/fuente de
 * íconos, esto sí se ve igual en todos.
 */
function statusBadge(tone: "success" | "destructive"): string {
  const bg = tone === "success" ? BRAND.successSoft : BRAND.destructiveSoft;
  const fg = tone === "success" ? BRAND.success : BRAND.destructive;
  const glyph = tone === "success" ? "&#10003;" : "&#10005;";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:44px;height:44px;background-color:${bg};border-radius:22px;margin:0 0 20px;">
      <tr>
        <td align="center" valign="middle" style="width:44px;height:44px;font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:19px;font-weight:700;color:${fg};line-height:44px;">
          ${glyph}
        </td>
      </tr>
    </table>`;
}

/**
 * Esqueleto compartido de email transaccional (doctype, head, header de
 * marca, card, footer exterior) — idéntico entre invitación y resultado de
 * procesamiento, solo cambia el contenido de `bodyHtml`.
 */
function emailShell(opts: { title: string; preheader: string; bodyHtml: string }): string {
  return `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${opts.title}</title>
<!--[if mso]>
<noscript>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
</noscript>
<![endif]-->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@500&display=swap');
  body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { border: 0; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  body { margin: 0; padding: 0; width: 100% !important; background-color: ${BRAND.background}; }
  a { text-decoration: none; }
  .btn-cta:hover { background-color: ${BRAND.primaryDark} !important; }
  @media only screen and (max-width: 600px) {
    .email-container { width: 100% !important; }
    .email-px { padding-left: 24px !important; padding-right: 24px !important; }
    .email-header-px { padding: 20px 24px !important; }
    .email-hero-px { padding: 32px 24px 4px !important; }
    .email-h1 { font-size: 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.background};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.background};">
    ${opts.preheader}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.background};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

          <!-- Card -->
          <tr>
            <td style="background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                <!-- Header de marca -->
                <tr>
                  <td class="email-header-px" style="background-color:${BRAND.panel};padding:24px 32px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="width:36px;" valign="middle">
                          <table role="presentation" width="32" cellpadding="0" cellspacing="0" border="0" style="width:32px;height:32px;background-color:${BRAND.panel};border-radius:8px;">
                            <tr>
                              <td style="padding:5px;" valign="middle">
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                  <tr>
                                    <td width="10" height="10" style="width:10px;height:10px;background-color:${BRAND.panelMuted1};border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>
                                    <td width="2" style="width:2px;font-size:0;line-height:0;">&nbsp;</td>
                                    <td width="10" height="10" style="width:10px;height:10px;background-color:${BRAND.gold};border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>
                                  </tr>
                                  <tr>
                                    <td colspan="3" height="2" style="height:2px;font-size:0;line-height:0;">&nbsp;</td>
                                  </tr>
                                  <tr>
                                    <td width="10" height="10" style="width:10px;height:10px;background-color:${BRAND.panelMuted1};border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>
                                    <td width="2" style="width:2px;font-size:0;line-height:0;">&nbsp;</td>
                                    <td width="10" height="10" style="width:10px;height:10px;background-color:${BRAND.panelMuted2};border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td style="padding-left:11px;" valign="middle">
                          <div style="font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;line-height:1.2;">MSC Excel AI</div>
                          <div style="font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:9.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:#a6b8ae;line-height:1.5;">Concierge de datos</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Contenido específico del template -->
                ${opts.bodyHtml}

              </table>
            </td>
          </tr>

          <!-- Footer exterior -->
          <tr>
            <td align="center" style="padding:28px 20px 0;">
              <div style="font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.muted};">
                MSC Excel AI &middot; Concierge de datos
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function invitationEmailHtml(params: {
  companyName: string;
  inviterEmail: string;
  acceptUrl: string;
}): string {
  const companyName = escapeHtml(params.companyName);
  const inviterEmail = escapeHtml(params.inviterEmail);
  const acceptUrl = escapeAttr(params.acceptUrl);
  const acceptUrlText = escapeHtml(params.acceptUrl);

  const bodyHtml = `
    <!-- Hero / cuerpo -->
    <tr>
      <td class="email-hero-px" style="padding:40px 40px 4px;">
        <div style="font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${BRAND.primary};margin:0 0 14px;">
          Invitación de equipo
        </div>
        <h1 class="email-h1" style="margin:0 0 14px;font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:23px;font-weight:500;letter-spacing:-.01em;line-height:1.35;color:${BRAND.foreground};">
          <strong style="font-weight:700;">${inviterEmail}</strong> te invitó a sumarte a <strong style="font-weight:700;">${companyName}</strong>
        </h1>
        <p style="margin:0 0 32px;font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.65;color:${BRAND.muted};">
          Vas a poder subir y revisar comparaciones de Excel junto a tu equipo en MSC Excel AI. Aceptá la invitación para crear tu cuenta y empezar.
        </p>
        ${ctaButton("Aceptar invitación", acceptUrl)}
        <p style="margin:20px 0 0;font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:12.5px;color:${BRAND.muted};">
          Este enlace vence en 7 días.
        </p>
      </td>
    </tr>

    <!-- Divider -->
    <tr>
      <td class="email-px" style="padding:32px 40px 0;">
        <div style="border-top:1px solid ${BRAND.border};line-height:0;font-size:0;">&nbsp;</div>
      </td>
    </tr>

    <!-- Fallback de link + nota -->
    <tr>
      <td class="email-px" style="padding:24px 40px 36px;">
        <p style="margin:0 0 6px;font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:12.5px;color:${BRAND.muted};">
          Si el botón no funciona, copiá y pegá este link en tu navegador:
        </p>
        <p style="margin:0 0 20px;font-family:'Roboto Mono',Consolas,'Courier New',monospace;font-size:12px;color:${BRAND.primary};word-break:break-all;line-height:1.6;">
          <a href="${acceptUrl}" target="_blank" style="color:${BRAND.primary};">${acceptUrlText}</a>
        </p>
        <p style="margin:0;font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:12.5px;color:${BRAND.muted};">
          Si no esperabas esta invitación, podés ignorar este correo con tranquilidad.
        </p>
      </td>
    </tr>`;

  return emailShell({
    title: `Invitación a ${companyName}`,
    preheader: `${inviterEmail} te invitó a sumarte a ${companyName} en MSC Excel AI. Aceptá para empezar a colaborar con tu equipo.`,
    bodyHtml,
  });
}

/**
 * Email de respaldo de cierre de procesamiento (Fase 1 del plan de
 * notificaciones, docs/notificaciones-push-plan.md §2.1 y §7). Copy
 * genérico a propósito: nunca incluye nombre de archivo real ni
 * destinatarios, para no exponer esos datos en previews de bandeja de
 * entrada / pantalla de bloqueo.
 */
export function submissionResultEmailHtml(params: {
  fileALabel: string;
  fileBLabel: string;
  type: "submission_completed" | "submission_failed" | "submission_timeout";
  errorMessage?: string;
  detailUrl: string;
}): string {
  const { type, errorMessage, detailUrl } = params;
  const detailUrlAttr = escapeAttr(detailUrl);

  const COPY = {
    submission_completed: {
      tone: "success" as const,
      eyebrow: "Solicitud completada",
      title: "Tu solicitud ya está lista",
      body: "Terminamos de procesar tu comparación de Excel. Ya podés descargar el resultado desde MSC Excel AI.",
      buttonLabel: "Ver resultado",
    },
    submission_failed: {
      tone: "destructive" as const,
      eyebrow: "Solicitud no procesada",
      title: "Tu solicitud no se pudo procesar",
      body: "Encontramos un problema al procesar tu comparación de Excel. Podés ver el detalle o volver a intentarlo desde MSC Excel AI.",
      buttonLabel: "Ver detalle",
    },
    submission_timeout: {
      tone: "destructive" as const,
      eyebrow: "Tiempo de espera agotado",
      title: "Tu solicitud tardó más de lo esperado",
      body: "No recibimos una respuesta del procesamiento dentro del tiempo esperado, así que marcamos la solicitud como fallida. Si esperabas un resultado, contactá al equipo.",
      buttonLabel: "Ver detalle",
    },
  } satisfies Record<
    typeof type,
    { tone: "success" | "destructive"; eyebrow: string; title: string; body: string; buttonLabel: string }
  >;

  const c = COPY[type];
  const eyebrowColor = c.tone === "success" ? BRAND.success : BRAND.destructive;

  const errorCallout =
    type === "submission_failed" && errorMessage
      ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
          <tr>
            <td style="background-color:${BRAND.destructiveSoft};border-left:3px solid ${BRAND.destructive};border-radius:0 8px 8px 0;padding:14px 18px;">
              <div style="font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${BRAND.destructive};margin:0 0 4px;">Motivo</div>
              <div style="font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.55;color:${BRAND.foreground};">${escapeHtml(errorMessage)}</div>
            </td>
          </tr>
        </table>`
      : "";

  const bodyHtml = `
    <!-- Hero / cuerpo -->
    <tr>
      <td class="email-hero-px" style="padding:40px 40px 4px;">
        ${statusBadge(c.tone)}
        <div style="font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${eyebrowColor};margin:0 0 14px;">
          ${c.eyebrow}
        </div>
        <h1 class="email-h1" style="margin:0 0 14px;font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:23px;font-weight:500;letter-spacing:-.01em;line-height:1.35;color:${BRAND.foreground};">
          ${c.title}
        </h1>
        <p style="margin:0 0 28px;font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.65;color:${BRAND.muted};">
          ${c.body}
        </p>
        ${errorCallout}
        ${ctaButton(c.buttonLabel, detailUrlAttr)}
      </td>
    </tr>

    <!-- Divider -->
    <tr>
      <td class="email-px" style="padding:32px 40px 0;">
        <div style="border-top:1px solid ${BRAND.border};line-height:0;font-size:0;">&nbsp;</div>
      </td>
    </tr>

    <!-- Nota final -->
    <tr>
      <td class="email-px" style="padding:24px 40px 36px;">
        <p style="margin:0;font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:12.5px;color:${BRAND.muted};">
          Este es un aviso automático de MSC Excel AI. Si no reconocés esta solicitud, contactá a tu administrador de equipo.
        </p>
      </td>
    </tr>`;

  return emailShell({
    title: c.title,
    preheader: `${c.title}. ${c.body}`,
    bodyHtml,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
