import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";

import { env } from "@/lib/env";
import { DEV_PREVIEW } from "@/lib/preview";

/**
 * Keep-alive de PocketBase (plan §10.1 / auditoría técnica 2026-07-03,
 * hallazgo Alto 14): algunos hosts de PocketBase (Pockethost, y planes
 * "sleep on idle" en Railway) hibernan la instancia con inactividad, y
 * los backups automáticos pueden fallar silenciosamente si corren
 * mientras está hibernada. Un ping periódico barato evita que llegue a
 * hibernar. Protegido con el mismo CRON_SECRET que mark-stale.
 *
 * Nota sobre Vercel Cron: en el plan Hobby, un schedule con más de una
 * ejecución por día directamente bloquea el deploy (error real visto en
 * 2026-07-04: "Hobby accounts are limited to daily cron jobs"), no lo
 * degrada en silencio. Por eso esta ruta NO está en vercel.json — se
 * pega manualmente con un servicio externo de uptime-ping (ej.
 * cron-job.org, UptimeRobot) apuntando a esta misma ruta con el header
 * Authorization correspondiente, cada 5-10 minutos.
 */
export async function GET(req: NextRequest) {
  if (DEV_PREVIEW) {
    return NextResponse.json({ ok: true, healthy: true });
  }

  const auth = req.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    const pb = new PocketBase(env.POCKETBASE_URL);
    const health = await pb.health.check();
    return NextResponse.json({ ok: true, healthy: health.code === 200 });
  } catch (e) {
    console.error("[cron/keep-alive] PocketBase no respondió:", e);
    return NextResponse.json({ ok: false, healthy: false }, { status: 502 });
  }
}
