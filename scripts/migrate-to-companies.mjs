#!/usr/bin/env node
// Backfill B2B (Fase 2, ver docs/b2b-multi-tenant-plan.md): convierte cada
// cuenta individual existente en Owner de una "empresa personal" de 1
// asiento, sin pedirle nada a nadie ni cobrar retroactivamente.
//
// Requiere haber corrido antes scripts/pb-migrations/001-b2b-schema.mjs
// (necesita que existan plans/companies/company_members/subscriptions).
//
// Idempotente: un usuario que ya tiene una fila en company_members se
// considera ya migrado y se salta. Se puede correr de nuevo tantas veces
// como haga falta (ej. para levantar usuarios creados después de la
// primera corrida) sin duplicar nada.
//
// Uso: node scripts/migrate-to-companies.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal() {
  const envPath = path.join(projectRoot, ".env.local");
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

// Transcripción 1:1 de PLAN_CATALOG (lib/billing.ts) al momento de escribir
// esta migración — es la ÚNICA vez que este catálogo se copia a mano; tras
// la Fase 3 (rewrite de lib/billing.ts), `plans` en PocketBase pasa a ser la
// única fuente de verdad y PLAN_CATALOG se elimina del código.
// max_seats: null en los tres — asientos ilimitados en todos los planes
// (decisión explícita, jul 2026: la diferenciación entre planes es
// comparaciones/mes y precio, no cantidad de usuarios).
const PLAN_SEED = [
  {
    key: "esencial",
    name: "Esencial",
    price_cents: 100000,
    currency: "USD",
    max_comparisons_month: 600,
    max_seats: null,
    overage_cents_per_unit: 200,
    is_custom: false,
    active: true,
  },
  {
    key: "profesional",
    name: "Profesional",
    price_cents: 180000,
    currency: "USD",
    max_comparisons_month: 1200,
    max_seats: null,
    overage_cents_per_unit: 183,
    is_custom: false,
    active: true,
  },
  {
    key: "corporativo",
    name: "Corporativo",
    price_cents: 350000,
    currency: "USD",
    max_comparisons_month: 2400,
    max_seats: null,
    overage_cents_per_unit: 175,
    is_custom: false,
    active: true,
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function seedPlans(pb) {
  const byKey = {};
  for (const seed of PLAN_SEED) {
    const existing = await pb
      .collection("plans")
      .getFirstListItem(`key = "${seed.key}"`)
      .catch(() => null);
    byKey[seed.key] = existing ?? (await pb.collection("plans").create(seed));
    console.log(`${existing ? "=" : "+"} plan ${seed.key}`);
  }
  return byKey;
}

/** true si el usuario ya tiene alguna membresía (migrado en una corrida anterior o ya invitado a una empresa nueva). */
async function alreadyMigrated(pb, userId) {
  const existing = await pb
    .collection("company_members")
    .getFirstListItem(`user = "${userId}"`)
    .catch(() => null);
  return existing !== null;
}

async function migrateUser(pb, user, plansByKey, now) {
  // email_domain queda vacío a propósito: son "empresas personales" de
  // backfill, no organizaciones verificadas — dos cuentas individuales del
  // mismo dominio (ej. dos personas @dinardi.com.ar con cuentas sueltas)
  // no pueden reclamar el mismo dominio (índice único idx_companies_domain).
  // Reclamar el dominio de verdad queda para el alta real de empresa
  // (app/api/companies/route.ts).
  const company = await pb.collection("companies").create({
    name: user.name || user.email,
    slug: `${slugify(user.name || user.email.split("@")[0])}-${user.id.slice(0, 6)}`,
    email_domain: "",
    domain_verified: false,
    owner: user.id,
    status: "active",
  });

  await pb.collection("company_members").create({
    company: company.id,
    user: user.id,
    role: "owner",
    status: "active",
  });

  const hadPlan = Boolean(user.plan);
  const plan = plansByKey[user.plan] ?? plansByKey.esencial;
  const periodEnd = hadPlan
    ? new Date(now.getTime() + 30 * DAY_MS)
    : new Date(now.getTime() + 14 * DAY_MS);

  const subscription = await pb.collection("subscriptions").create({
    company: company.id,
    plan: plan.id,
    status: hadPlan ? "active" : "trialing",
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
  });

  await pb.collection("subscription_events").create({
    subscription: subscription.id,
    type: "created",
    to_plan: plan.id,
    metadata: { source: "migrate-to-companies", had_previous_plan: hadPlan },
  });

  // El admin client bypasea users.updateRule (que bloquea justamente que un
  // cliente normal escriba estos dos campos) — acá es la única vía legítima.
  await pb.collection("users").update(user.id, {
    company: company.id,
    company_role: "owner",
  });

  let backfilled = 0;
  for (;;) {
    const page = await pb.collection("submissions").getList(1, 200, {
      filter: `user = "${user.id}" && company = ""`,
    });
    if (page.items.length === 0) break;
    for (const submission of page.items) {
      await pb.collection("submissions").update(submission.id, { company: company.id });
      backfilled += 1;
    }
  }

  return { company, backfilled };
}

async function verify(pb) {
  const orphanSubmissions = await pb.collection("submissions").getList(1, 1, {
    filter: 'company = ""',
  });
  const orphanUsers = await pb.collection("users").getList(1, 1, {
    filter: 'company = ""',
  });
  return {
    orphanSubmissions: orphanSubmissions.totalItems,
    orphanUsers: orphanUsers.totalItems,
  };
}

async function main() {
  const fileEnv = loadEnvLocal();
  const url = process.env.POCKETBASE_URL || fileEnv.POCKETBASE_URL;
  const email = process.env.POCKETBASE_ADMIN_EMAIL || fileEnv.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || fileEnv.POCKETBASE_ADMIN_PASSWORD;

  if (!url || !email || !password) {
    console.error(
      "Faltan POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD (.env.local).",
    );
    process.exit(1);
  }

  const pb = new PocketBase(url);
  await pb.collection("_superusers").authWithPassword(email, password);

  console.log(`Backfill B2B contra ${url}...\n`);

  const plansByKey = await seedPlans(pb);
  console.log("");

  const users = await pb.collection("users").getFullList({ batch: 200 });
  const now = new Date();

  let migrated = 0;
  let skipped = 0;
  let submissionsBackfilled = 0;

  for (const user of users) {
    if (await alreadyMigrated(pb, user.id)) {
      skipped += 1;
      continue;
    }
    const { company, backfilled } = await migrateUser(pb, user, plansByKey, now);
    submissionsBackfilled += backfilled;
    migrated += 1;
    console.log(`+ ${user.email} -> empresa "${company.name}" (${backfilled} submissions backfilleadas)`);
  }

  console.log(`\n${migrated} usuario(s) migrado(s), ${skipped} ya estaban migrados.`);
  console.log(`${submissionsBackfilled} submissions backfilleadas en esta corrida.`);

  const report = await verify(pb);
  console.log("\n=== Verificación ===");
  console.log(`submissions sin company: ${report.orphanSubmissions}`);
  console.log(`users sin company: ${report.orphanUsers}`);
  if (report.orphanSubmissions === 0 && report.orphanUsers === 0) {
    console.log(
      "\nOK — cobertura 100%. Recién ahora es seguro marcar submissions.company y " +
        "users.company/company_role como required, y retirar ALLOWED_EMAIL_DOMAINS/ALLOWED_EMAILS.",
    );
  } else {
    console.log(
      "\nATENCIÓN — todavía hay registros sin empresa. No marcar campos como required ni retirar " +
        "el allowlist viejo hasta que esto dé 0/0 (correr este script de nuevo cubre altas nuevas).",
    );
  }
}

main().catch((err) => {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
});
