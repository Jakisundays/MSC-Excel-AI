import "server-only";

import type PocketBase from "pocketbase";

import type { NotificationType, SubmissionRecord } from "@/lib/pocketbase/types";
import { env } from "@/lib/env";
import { sendMail, submissionResultEmailHtml } from "@/lib/mailer";
import { sendPushToUser } from "@/lib/push";

/**
 * Punto único de disparo de notificaciones (Fases 1 y 2 del plan,
 * docs/notificaciones-push-plan.md). Llamado desde el webhook de cierre
 * (`app/api/webhooks/processing-result/route.ts`) y desde el cron de SLA
 * (`app/api/cron/mark-stale/route.ts`), nunca desde el cliente.
 *
 * Registra la notificación in-app, manda el email de respaldo y manda Web
 * Push (Fase 2) a las suscripciones activas del usuario.
 *
 * Esta función NUNCA tira: el llamador ya escribió el estado real en
 * PocketBase antes de invocarla, y una falla acá no debe hacer fallar esa
 * respuesta (webhook / cron).
 */
export async function notifySubmissionResult(
  pb: PocketBase,
  submission: SubmissionRecord,
  type: NotificationType,
): Promise<void> {
  try {
    await pb.collection("notifications").create({
      user: submission.user,
      company: submission.company || "",
      submission: submission.id,
      type,
    });
  } catch (err) {
    console.error(
      `[notify] no se pudo crear la notificación in-app para submission ${submission.id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  try {
    const user = await pb.collection("users").getOne(submission.user);
    const detailUrl = `${env.APP_URL}/historial/${submission.id}`;

    let subject: string;
    if (type === "submission_completed") {
      subject = "Tu solicitud está lista";
    } else if (type === "submission_failed") {
      subject = "Tu solicitud falló";
    } else {
      subject = "Tu solicitud tardó demasiado";
    }

    await sendMail({
      to: user.email,
      subject,
      html: submissionResultEmailHtml({
        fileALabel: "Archivo A",
        fileBLabel: "Archivo B",
        type,
        errorMessage: submission.error || undefined,
        detailUrl,
      }),
    });
  } catch (err) {
    console.error(
      `[notify] no se pudo enviar el email de respaldo para submission ${submission.id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  try {
    let title: string;
    if (type === "submission_completed") {
      title = "Tu solicitud está lista";
    } else if (type === "submission_failed") {
      title = "Tu solicitud falló";
    } else {
      title = "Tu solicitud tardó demasiado";
    }

    await sendPushToUser(pb, submission.user, {
      title,
      body: "Toca para ver el detalle.",
      url: `${env.APP_URL}/historial/${submission.id}`,
    });
  } catch (err) {
    console.error(
      `[notify] no se pudo enviar el Web Push para submission ${submission.id}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
