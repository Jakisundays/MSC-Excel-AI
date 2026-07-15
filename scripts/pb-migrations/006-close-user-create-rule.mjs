#!/usr/bin/env node
// Cierra la creación pública de usuarios en la colección "users".
//
// Por qué: la auditoría encontró que users.createRule estaba en "" (string
// vacío), lo que en PocketBase significa "cualquiera puede crear" — incluso
// sin autenticarse. Eso permitía a cualquiera hacer POST directo a
// /api/collections/users/records saltándose por completo el rate limiting y
// la política de contraseñas que aplica app/api/auth/register/route.ts. Ese
// endpoint sigue siendo el único camino de registro self-service: usa el
// admin client (autenticado como _superusers), así que no depende del
// createRule público y sigue funcionando igual después de este cambio.
// El login/registro por Google OAuth tampoco se ve afectado: PocketBase crea
// la cuenta OAuth2 por su propio flujo interno, no pasa por el createRule
// público de la colección.
//
// Después de este cambio, createRule = null (solo superusers pueden crear
// usuarios vía API), igual que el resto de las colecciones de este proyecto.
//
// Uso: node scripts/pb-migrations/006-close-user-create-rule.mjs
// Lee POCKETBASE_URL/POCKETBASE_ADMIN_EMAIL/POCKETBASE_ADMIN_PASSWORD de
// .env.local (mismo patrón que scripts/export-pb-schema.mjs).
//
// IMPORTANTE: este script ESCRIBE schema en la instancia real de PocketBase.
// Correlo primero contra una instancia de staging/dev si existe. Después de
// correrlo, regenerar el snapshot con `npm run export:pb-schema` y commitear
// el diff de pb_migrations/schema_snapshot.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase, { ClientResponseError } from "pocketbase";

const projectRoot = path.dirname(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
);

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

  console.log(`Cerrando createRule pública de users contra ${url}...\n`);

  // users — createRule pasa de "" (cualquiera puede crear) a null (solo
  // superusers). El registro self-service sigue funcionando exclusivamente
  // vía app/api/auth/register/route.ts (admin client, bypassa reglas). El
  // alta por Google OAuth tampoco pasa por este createRule.
  await ensureFieldsAndRules(pb, "users", {
    fields: [],
    rules: { createRule: null },
  });

  console.log(
    "\nListo. Corré `npm run export:pb-schema` y commiteá el diff de pb_migrations/schema_snapshot.json.",
  );
}

main().catch((err) => {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
});
