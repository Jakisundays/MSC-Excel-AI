#!/usr/bin/env node
// Migración de schema B2B/multi-tenant — crea las colecciones de la Fase 1/2
// del plan de arquitectura corporativa (ver docs/b2b-multi-tenant-plan.md).
//
// Por qué un script y no `pocketbase migrate collections`: PocketBase corre
// hosted en Pockethost (sin acceso a shell/filesystem), así que la CLI
// nativa de migraciones no es viable acá. Este script reemplaza la práctica
// anterior de "cambiar a mano en el panel admin" — aplica los cambios contra
// la API admin remota y es idempotente (se puede correr más de una vez sin
// duplicar colecciones ni pisar reglas ya aplicadas).
//
// Uso: node scripts/pb-migrations/001-b2b-schema.mjs
// Lee POCKETBASE_URL/POCKETBASE_ADMIN_EMAIL/POCKETBASE_ADMIN_PASSWORD de
// .env.local (mismo patrón que scripts/export-pb-schema.mjs).
//
// IMPORTANTE: este script ESCRIBE schema en la instancia real de PocketBase.
// Correlo primero contra una instancia de staging/dev si existe. Después de
// correrlo, regenerar el snapshot con `npm run export:pb-schema` y commitear
// el diff.
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

function textField(name, { required = false, max = 0 } = {}) {
  return { name, type: "text", required, max, min: 0, pattern: "", autogeneratePattern: "" };
}

function numberField(name, { required = false, min = null, onlyInt = false } = {}) {
  return { name, type: "number", required, min, max: null, onlyInt };
}

function boolField(name, { required = false } = {}) {
  return { name, type: "bool", required };
}

function jsonField(name) {
  return { name, type: "json", required: false, maxSize: 0 };
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

  console.log(`Aplicando schema B2B contra ${url}...\n`);

  // 1. plans — sin relaciones a otras colecciones nuevas, se crea primero.
  const plans = await ensureCollection(pb, {
    name: "plans",
    type: "base",
    listRule: "",
    viewRule: 'is_custom = false || @request.auth.id != ""',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      textField("key", { required: true }),
      textField("name", { required: true }),
      numberField("price_cents", { required: true, min: 0 }),
      textField("currency", { required: true }),
      numberField("max_comparisons_month", { required: true, min: 0, onlyInt: true }),
      numberField("max_seats", { min: 0, onlyInt: true }),
      numberField("overage_cents_per_unit", { min: 0 }),
      boolField("is_custom"),
      boolField("active"),
      autodateCreated,
      autodateUpdated,
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_plans_key` ON `plans` (`key`)'],
  });

  // 2. companies — relaciona a users (id estable, no hace falta resolverlo).
  const companies = await ensureCollection(pb, {
    name: "companies",
    type: "base",
    listRule: "id = @request.auth.company",
    viewRule: "id = @request.auth.company",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      textField("name", { required: true }),
      textField("slug", { required: true }),
      textField("email_domain"),
      boolField("domain_verified"),
      relationTo(USERS_COLLECTION_ID, { name: "owner", required: true }),
      selectField("status", ["active", "suspended", "archived"], { required: true }),
      autodateCreated,
      autodateUpdated,
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_companies_slug` ON `companies` (`slug`)',
      'CREATE UNIQUE INDEX `idx_companies_domain` ON `companies` (`email_domain`) WHERE `email_domain` != \'\'',
    ],
  });

  // 3. company_members — puente company <-> user.
  await ensureCollection(pb, {
    name: "company_members",
    type: "base",
    listRule: '@request.auth.id != "" && (user = @request.auth.id || company = @request.auth.company)',
    viewRule: '@request.auth.id != "" && (user = @request.auth.id || company = @request.auth.company)',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      relationTo(companies.id, { name: "company", required: true, cascadeDelete: true }),
      relationTo(USERS_COLLECTION_ID, { name: "user", required: true, cascadeDelete: true }),
      selectField("role", ["owner", "admin", "member"], { required: true }),
      selectField("status", ["active", "invited", "suspended"], { required: true }),
      relationTo(USERS_COLLECTION_ID, { name: "invited_by", required: false }),
      autodateCreated,
      autodateUpdated,
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_company_members_unique` ON `company_members` (`company`, `user`)',
    ],
  });

  // 4. subscriptions — 1:1 con companies (una fila por empresa, se actualiza in-place).
  const subscriptions = await ensureCollection(pb, {
    name: "subscriptions",
    type: "base",
    listRule: "company = @request.auth.company",
    viewRule: "company = @request.auth.company",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      relationTo(companies.id, { name: "company", required: true, cascadeDelete: true }),
      relationTo(plans.id, { name: "plan", required: true }),
      selectField("status", ["trialing", "active", "past_due", "canceled"], { required: true }),
      numberField("seats_purchased", { min: 0, onlyInt: true }),
      numberField("usage_limit_override", { min: 0, onlyInt: true }),
      { name: "current_period_start", type: "date", required: true },
      { name: "current_period_end", type: "date", required: true },
      autodateCreated,
      autodateUpdated,
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_subscriptions_company` ON `subscriptions` (`company`)'],
  });

  // 5. subscription_events — auditoría de cambios de plan/pago.
  await ensureCollection(pb, {
    name: "subscription_events",
    type: "base",
    listRule: "subscription.company = @request.auth.company",
    viewRule: "subscription.company = @request.auth.company",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      relationTo(subscriptions.id, { name: "subscription", required: true, cascadeDelete: true }),
      selectField(
        "type",
        ["created", "plan_changed", "renewed", "canceled", "reactivated"],
        { required: true },
      ),
      relationTo(plans.id, { name: "from_plan", required: false }),
      relationTo(plans.id, { name: "to_plan", required: false }),
      jsonField("metadata"),
      autodateCreated,
      autodateUpdated,
    ],
  });

  // 6. invitations
  await ensureCollection(pb, {
    name: "invitations",
    type: "base",
    listRule: "company = @request.auth.company",
    viewRule: 'company = @request.auth.company || token = @request.query.token',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      relationTo(companies.id, { name: "company", required: true, cascadeDelete: true }),
      { name: "email", type: "email", required: true },
      selectField("role", ["admin", "member"], { required: true }),
      textField("token", { required: true }),
      selectField("status", ["pending", "accepted", "revoked", "expired"], { required: true }),
      relationTo(USERS_COLLECTION_ID, { name: "invited_by", required: true }),
      { name: "expires_at", type: "date", required: true },
      autodateCreated,
      autodateUpdated,
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_invitations_token` ON `invitations` (`token`)'],
  });

  // 7. users — agrega company/company_role denormalizados. El :isset en
  // updateRule es el que cierra el hallazgo de seguridad crítico (mismo tipo
  // de bug que la escalada de is_admin en la auditoría de Buses Panamá):
  // sin esto, cualquier usuario podría auto-escribirse company/company_role
  // vía PATCH directo a /api/collections/users/records/:id.
  await ensureFieldsAndRules(pb, "users", {
    fields: [
      relationTo(companies.id, { name: "company", required: false }),
      selectField("company_role", ["owner", "admin", "member"], { required: false }),
    ],
    rules: {
      updateRule:
        'id = @request.auth.id && @request.body.company:isset = false && @request.body.company_role:isset = false',
    },
  });

  // 8. submissions — agrega company + reglas ampliadas (owner/admin ven todo
  // el equipo; member sigue viendo solo lo suyo). createRule impide
  // falsificar la empresa de un submission.
  await ensureFieldsAndRules(pb, "submissions", {
    fields: [relationTo(companies.id, { name: "company", required: false, cascadeDelete: false })],
    rules: {
      listRule:
        '@request.auth.id != "" && (user = @request.auth.id || (company = @request.auth.company && (@request.auth.company_role = "owner" || @request.auth.company_role = "admin")))',
      viewRule:
        '@request.auth.id != "" && (user = @request.auth.id || (company = @request.auth.company && (@request.auth.company_role = "owner" || @request.auth.company_role = "admin")))',
      createRule:
        '@request.auth.id != "" && @request.body.user = @request.auth.id && @request.body.company = @request.auth.company',
    },
  });

  console.log(
    "\nListo. Corré `npm run export:pb-schema` y commiteá el diff de pb_migrations/schema_snapshot.json.",
  );
  console.log(
    "IMPORTANTE: submissions.company y users.company/company_role quedan opcionales a propósito — " +
      "recién se marcan required tras correr scripts/migrate-to-companies.mjs y verificar backfill 100%.",
  );
}

main().catch((err) => {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
});
