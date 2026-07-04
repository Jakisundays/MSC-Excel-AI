import { NextRequest, NextResponse } from "next/server";

import {
  getServerPb,
  PB_COOKIE,
  serializeAuth,
  authCookieOptions,
} from "@/lib/pocketbase/server";
import { isPlanKey } from "@/lib/billing";
import { billingProvider } from "@/lib/billing-server";
import { checkRateLimit } from "@/lib/rate-limit";

/** Selecciona/cambia el plan de la cuenta autenticada. */
export async function POST(req: NextRequest) {
  const pb = await getServerPb();
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const userId = pb.authStore.record!.id;

  if (!checkRateLimit(`billing-plan:${userId}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Esperá un minuto e intentá de nuevo." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const plan = body?.plan;

  if (!isPlanKey(plan)) {
    return NextResponse.json({ error: "Plan inválido." }, { status: 400 });
  }

  const result = await billingProvider.selectPlan(userId, plan);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const updated = await pb.collection("users").getOne(userId);
  pb.authStore.save(pb.authStore.token, updated);

  const res = NextResponse.json({
    ok: true,
    plan: result.plan,
    selectedAt: result.selectedAt,
  });
  res.cookies.set(PB_COOKIE, serializeAuth(pb), authCookieOptions);
  return res;
}
