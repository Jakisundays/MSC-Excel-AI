#!/usr/bin/env node
// Migración: agrega result_file_name a submissions, para conservar el
// nombre REAL (no el interno mangleado por PocketBase con sufijo
// aleatorio) del archivo de resultado -- necesario para adjuntarlo con su
// nombre correcto en el email de resultado (ver lib/mailer.ts::
// sendResultEmailWithAttachments y app/api/webhooks/processing-result/route.ts).
// Mismo patrón que original_file_a/original_file_b (003-original-files.mjs):
// esas sí tienen file_a_name/file_b_name guardados aparte como texto plano;
// result_file no tenía su equivalente hasta este campo.
//
// Uso: node scripts/pb-migrations/005-result-file-name.mjs
// Lee POCKETBASE_URL/POCKETBASE_ADMIN_EMAIL/POCKETBASE_ADMIN_PASSWORD de
// .env.local, mismo patrón que 001-b2b-schema.mjs, 002-historial-equipo.mjs
// y 003-original-files.mjs.
// Idempotente: si el campo ya existe, no hace nada.
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

function textField(name, { required = false, max = 0 } = {}) {
  return { name, type: "text", required, max, min: 0, pattern: "", autogeneratePattern: "" };
}

const NEW_FIELDS = [textField("result_file_name")];

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

  console.log(`Aplicando migración de result_file_name contra ${url}...\n`);

  const collection = await pb.collections.getOne("submissions");
  const existingNames = new Set(collection.fields.map((f) => f.name));
  const newFields = NEW_FIELDS.filter((f) => !existingNames.has(f.name));

  if (newFields.length === 0) {
    console.log("submissions: result_file_name ya existe, nada que hacer.");
    return;
  }

  await pb.collections.update(collection.id, {
    fields: [...collection.fields, ...newFields],
  });

  console.log(
    `submissions: actualizado. +${newFields.length} campo(s) nuevo(s) (${newFields
      .map((f) => f.name)
      .join(", ")}).`,
  );
  console.log(
    "\nListo. Corré `npm run export:pb-schema` y commiteá el diff de pb_migrations/schema_snapshot.json.",
  );
}

main().catch((err) => {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
});
