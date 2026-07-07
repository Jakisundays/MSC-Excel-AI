#!/usr/bin/env node
// Migración: Fase 2 del plan de notificaciones (docs/notificaciones-push-plan.md)
// — Web Push real (VAPID). Crea la colección `push_subscriptions`, donde
// cada fila es un dispositivo/navegador suscripto de un usuario.
//
// Uso: node scripts/pb-migrations/004-push-subscriptions.mjs
// Lee POCKETBASE_URL/POCKETBASE_ADMIN_EMAIL/POCKETBASE_ADMIN_PASSWORD de
// .env.local, mismo patrón que 001-b2b-schema.mjs / 002-historial-equipo.mjs
// / 003-notificaciones.mjs. Idempotente: correrlo dos veces no rompe nada ni
// duplica nada.
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

// ── Campos comunes ──────────────────────────────────────────────

const autodateCreated = { name: "created", type: "autodate", onCreate: true, onUpdate: false };
const autodateUpdated = { name: "updated", type: "autodate", onCreate: true, onUpdate: true };

function relationTo(collectionId, { name, required = false, cascadeDelete = false, maxSelect = 1 }) {
  return { name, type: "relation", collectionId, required, cascadeDelete, maxSelect, minSelect: 0 };
}

function textField(name, { required = false, max = 0 } = {}) {
  return { name, type: "text", required, max, min: 0, pattern: "", autogeneratePattern: "" };
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

  console.log(`Aplicando migración de Web Push (Fase 2) contra ${url}...\n`);

  // push_subscriptions — un row por dispositivo/navegador suscripto.
  // create/update: solo vía cliente admin desde /api/push/subscribe (ver
  // hallazgo de seguridad jul 2026 -- el updateRule original permitía al
  // propio usuario reescribir `endpoint`/`keys_*`/`user` de su fila sin
  // ninguna validación de servidor, vía la API REST directa de PocketBase,
  // igual que ya se restringió en `notifications.updateRule`). Solo se deja
  // `deleteRule` de auto-servicio para que /api/push/unsubscribe pueda
  // borrar la fila con la sesión del usuario.
  await ensureCollection(pb, {
    name: "push_subscriptions",
    type: "base",
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: null,
    updateRule: null,
    deleteRule: '@request.auth.id != "" && user = @request.auth.id',
    fields: [
      relationTo(USERS_COLLECTION_ID, { name: "user", required: true, cascadeDelete: true }),
      textField("endpoint", { required: true }),
      textField("keys_p256dh", { required: true }),
      textField("keys_auth", { required: true }),
      textField("user_agent"),
      { name: "last_seen_at", type: "autodate", onCreate: true, onUpdate: true },
      autodateCreated,
      autodateUpdated,
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_push_subscriptions_endpoint` ON `push_subscriptions` (`endpoint`)",
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
