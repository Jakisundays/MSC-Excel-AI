import { NextRequest, NextResponse, after } from "next/server";

import { getAdminPb } from "@/lib/pocketbase/admin";
import { env } from "@/lib/env";
import { notifySubmissionResult } from "@/lib/notify";
import type { NotificationType, SubmissionRecord } from "@/lib/pocketbase/types";

/**
 * Endpoint interno: dispara notifySubmissionResult() en una invocación de
 * función COMPLETAMENTE SEPARADA de la del webhook de cierre / el cron de
 * SLA. after() adelanta cuándo se envía la respuesta, pero NO extiende el
 * límite de duración de la invocación que lo llama -- el trabajo lento
 * (bajar 3 archivos de PocketBase + subirlos al orchestrator + esperar el
 * envío SMTP real) corriendo dentro del after() del webhook mismo seguía
 * compitiendo por el presupuesto de tiempo de ESA misma invocación, y se
 * cortaba de forma intermitente según la latencia de red del momento
 * (confirmado en producción, jul-2026: dos submissions de tamaño casi
 * idéntico, una llegó y la otra no).
 *
 * Este endpoint recibe solo el id de la submission (nunca payload
 * sensible), vuelve a leerla fresca, y hace TODO el trabajo lento dentro
 * de su PROPIO after() -- con su propio maxDuration, en su propia
 * invocación, sin heredar nada del presupuesto del caller.
 *
 * Auth: reusa RESULT_WEBHOOK_SECRET (mismo secreto ya configurado en
 * Vercel para el hop orchestrator->Next.js) en vez de introducir uno
 * nuevo -- evita depender de que alguien lo agregue a mano en el
 * dashboard de Vercel antes de que esto funcione. Misma frontera de
 * confianza igual: "solo nuestro propio backend puede llamar a esto".
 */
export const maxDuration = 60;

const VALID_TYPES: NotificationType[] = [
  "submission_completed",
  "submission_failed",
  "submission_timeout",
];

export async function POST(req: NextRequest) {
  const secretHeader = req.headers.get("x-internal-secret");
  if (!env.RESULT_WEBHOOK_SECRET || secretHeader !== env.RESULT_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
  const notificationType = body?.notificationType as NotificationType | undefined;

  if (!submissionId) {
    return NextResponse.json({ ok: false, error: "missing submissionId" }, { status: 400 });
  }
  if (!notificationType || !VALID_TYPES.includes(notificationType)) {
    return NextResponse.json({ ok: false, error: "invalid notificationType" }, { status: 400 });
  }

  const pb = await getAdminPb();

  let submission: SubmissionRecord;
  try {
    submission = (await pb.collection("submissions").getOne(submissionId)) as unknown as SubmissionRecord;
  } catch (e) {
    console.error("[internal/notify-submission] no se encontró la submission:", submissionId, e);
    return NextResponse.json({ ok: false, error: "submission not found" }, { status: 404 });
  }

  // El trabajo lento vive acá, en el after() de ESTA invocación -- nunca
  // en la del caller.
  after(async () => {
    try {
      await notifySubmissionResult(pb, submission, notificationType);
    } catch (e) {
      console.error("[internal/notify-submission] error notificando:", submissionId, e);
    }
  });

  return NextResponse.json({ ok: true, submission_id: submissionId });
}
