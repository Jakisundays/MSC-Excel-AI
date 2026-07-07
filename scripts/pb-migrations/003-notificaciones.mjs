#!/usr/bin/env node
// Migración: Fase 1 del plan de notificaciones (docs/notificaciones-push-plan.md)
// — centro de notificaciones in-app + gate anti-duplicados para el webhook
// de cierre. Todavía SIN Web Push (eso es Fase 2, ver §10 del plan).
//
// Uso: node scripts/pb-migrations/003-notificaciones.mjs
// Lee POCKETBASE_URL/POCKETBASE_ADMIN_EMAIL/POCKETBASE_ADMIN_PASSWORD de
// .env.local, mismo patrón que 001-b2b-schema.mjs y 002-historial-equipo.mjs.
// Idempotente: correrlo dos veces no rompe nada ni duplica nada.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase, { ClientResponseError } from "pocketbase";

const projectRoot = path.dirname(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
);

// ID interno estable de la colección auth "users" en cualquier instancia
// de PocketBase (confirmado en pb_migrations/schema_snapshot.json) — se usa
// como collectionId de las relaciones hacia usuarios sin tener que
// resolverlo en runtime.
const USERS_COLLECTION_ID = "_pb_users_auth_";

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

async function getExisting(pb, name) {
  try {
    return await pb.collections.getOne(name);
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}

/** Crea la colección si no existe. Si ya existe, no la toca (evita pisar cambios manuales hechos en el panel) y solo avisa. */
async function ensureCollection(pb, definition) {
  const existing = await getExisting(pb, definition.name);
  if (existing) {
    console.log(`= ${definition.name}: ya existe (id ${existing.id}), no se modifica.`);
    return existing;
  }
  const created = await pb.collections.create(definition);
  console.log(`+ ${definition.name}: creada (id ${created.id}).`);
  return created;
}

/** Agrega campos nuevos a una colección existente (solo si el campo no existe ya por nombre) y actualiza las reglas indicadas. */
async function ensureFieldsAndRules(pb, name, { fields = [], rules = {} }) {
  const collection = await getExisting(pb, name);
  if (!collection) throw new Error(`${name}: no existe, no se puede modificar.`);

  const existingNames = new Set(collection.fields.map((f) => f.name));
  const newFields = fields.filter((f) => !existingNames.has(f.name));
  if (newFields.length === 0) {
    console.log(`= ${name}: los campos nuevos ya existen.`);
  }

  const patch = {};
  if (newFields.length > 0) {
    patch.fields = [...collection.fields, ...newFields];
  }
  for (const [rule, expr] of Object.entries(rules)) {
    if (collection[rule] !== expr) patch[rule] = expr;
  }

  if (Object.keys(patch).length === 0) {
    console.log(`= ${name}: sin cambios pendientes.`);
    return collection;
  }

  const updated = await pb.collections.update(collection.id, patch);
  console.log(
    `~ ${name}: actualizada (+${newFields.length} campo(s), reglas: ${Object.keys(rules).filter((r) => patch[r] !== undefined).join(", ") || "sin cambios"}).`,
  );
  return updated;
}

// ── Campos comunes ──────────────────────────────────────────────

const autodateCreated = { name: "created", type: "autodate", onCreate: true, onUpdate: false };
const autodateUpdated = { name: "updated", type: "autodate", onCreate: true, onUpdate: true };

function relationTo(collectionId, { name, required = false, cascadeDelete = false, maxSelect = 1 }) {
  return { name, type: "relation", collectionId, required, cascadeDelete, maxSelect, minSelect: 0 };
}

function selectField(name, values, { required = true, maxSelect = 1 } = {}) {
  return { name, type: "select", values, required, maxSelect };
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

  console.log(`Aplicando migración de Notificaciones (Fase 1) contra ${url}...\n`);

  // a) submissions.notified_at — gate de una sola disparada (§6 del plan):
  // se setea en el mismo patch que mueve status a terminal, antes de
  // llamar a notifySubmissionResult().
  await ensureFieldsAndRules(pb, "submissions", {
    fields: [{ name: "notified_at", type: "date", required: false }],
    rules: {},
  });

  // b) notifications — centro de notificaciones in-app.
  const submissions = await pb.collections.getOne("submissions");
  const companies = await getExisting(pb, "companies");
  if (!companies) {
    console.warn(
      "companies: no existe en esta instancia -- se omite el campo `company` en notifications.",
    );
  }

  const notificationFields = [
    relationTo(submissions.id, { name: "submission", required: true, cascadeDelete: true }),
    relationTo(USERS_COLLECTION_ID, { name: "user", required: true, cascadeDelete: true }),
  ];
  if (companies) {
    notificationFields.push(
      relationTo(companies.id, { name: "company", required: false, cascadeDelete: false }),
    );
  }
  notificationFields.push(
    selectField(
      "type",
      ["submission_completed", "submission_failed", "submission_timeout"],
      { required: true },
    ),
    { name: "read_at", type: "date", required: false },
    autodateCreated,
    autodateUpdated,
  );

  await ensureCollection(pb, {
    name: "notifications",
    type: "base",
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: null,
    updateRule:
      'user = @request.auth.id && @request.body.submission:isset = false && @request.body.type:isset = false && @request.body.user:isset = false && @request.body.company:isset = false',
    deleteRule: null,
    fields: notificationFields,
    indexes: [
      'CREATE INDEX `idx_notifications_user_created` ON `notifications` (`user`, `created`)',
    ],
  });

  console.log(
    "\nListo. Corré `npm run export:pb-schema` y commiteá el diff de pb_migrations/schema_snapshot.json.",
  );
}

main().catch((err) => {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
});
