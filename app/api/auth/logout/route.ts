import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { PB_COOKIE } from "@/lib/pocketbase/server";

/** Logout: borra la cookie de sesión. POST para evitar CSRF de logout. */
export async function POST() {
  const res = NextResponse.redirect(new URL("/login", env.APP_URL));
  res.cookies.delete(PB_COOKIE);
  return res;
}
