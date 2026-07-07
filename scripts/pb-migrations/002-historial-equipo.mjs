#!/usr/bin/env node
// Migración: habilita "ver historial de equipo" en submissions para
// CUALQUIER miembro de la empresa (decisión de producto, jul 2026 — no
// solo owner/admin), y agrega los índices que hacen falta para que
// paginar/filtrar no escanee toda la tabla a miles de registros.
//
// Uso: node scripts/pb-migrations/002-historial-equipo.mjs
// Lee POCKETBASE_URL/POCKETBASE_ADMIN_EMAIL/POCKETBASE_ADMIN_PASSWORD de
// .env.local, mismo patrón que 001-b2b-schema.mjs. Idempotente.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";

const projectRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

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

const NEW_LIST_VIEW_RULE =
  '@request.auth.id != "" && (user = @request.auth.id || company = @request.auth.company)';

const DESIRED_INDEXES = [
  {
    name: "idx_submissions_user_created",
    sql: "CREATE INDEX `idx_submissions_user_created` ON `submissions` (`user`, `created`)",
  },
  {
    name: "idx_submissions_company_created",
    sql: "CREATE INDEX `idx_submissions_company_created` ON `submissions` (`company`, `created`)",
  },
  {
    name: "idx_submissions_company_status_created",
    sql: "CREATE INDEX `idx_submissions_company_status_created` ON `submissions` (`company`, `status`, `created`)",
  },
];

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

  console.log(`Aplicando migración de Historial de equipo contra ${url}...\n`);

  const collection = await pb.collections.getOne("submissions");

  const indexesToAdd = DESIRED_INDEXES.filter(
    (d) => !collection.indexes.some((idx) => idx.includes(d.name)),
  );

  const patch = {};
  if (indexesToAdd.length > 0) {
    patch.indexes = [...collection.indexes, ...indexesToAdd.map((d) => d.sql)];
  }
  if (collection.listRule !== NEW_LIST_VIEW_RULE) patch.listRule = NEW_LIST_VIEW_RULE;
  if (collection.viewRule !== NEW_LIST_VIEW_RULE) patch.viewRule = NEW_LIST_VIEW_RULE;

  if (Object.keys(patch).length === 0) {
    console.log("submissions: ya está todo aplicado, nada que hacer.");
    return;
  }

  await pb.collections.update(collection.id, patch);
  console.log(
    `submissions: actualizado. +${indexesToAdd.length} índice(s) nuevo(s)` +
      (indexesToAdd.length ? ` (${indexesToAdd.map((d) => d.name).join(", ")})` : "") +
      `, reglas listRule/viewRule ${patch.listRule ? "actualizadas (ahora cualquier rol ve el equipo)" : "sin cambios"}.`,
  );

  console.log(
    "\nListo. Corré `npm run export:pb-schema` y commiteá el diff de pb_migrations/schema_snapshot.json.",
  );
}

main().catch((err) => {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
});
