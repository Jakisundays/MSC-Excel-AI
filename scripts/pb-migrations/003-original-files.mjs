#!/usr/bin/env node
// Migración: agrega original_file_a/original_file_b a submissions, para
// conservar los archivos .xlsx/.xls que el usuario sube en Nueva Solicitud
// (hoy solo se guarda result_file -- ver docs/original-files-storage-plan.md).
//
// Uso: node scripts/pb-migrations/003-original-files.mjs
// Lee POCKETBASE_URL/POCKETBASE_ADMIN_EMAIL/POCKETBASE_ADMIN_PASSWORD de
// .env.local, mismo patrón que 001-b2b-schema.mjs y 002-historial-equipo.mjs.
// Idempotente: si los campos ya existen, no hace nada.
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

// Mismos mimeTypes/semántica que result_file (ver pb_migrations/schema_snapshot.json).
// maxSize algo mayor (25MB vs 20MB) porque el original sin filtrar --con
// formato, fórmulas, múltiples hojas-- suele pesar más que el resultado de
// una sola hoja. Ajustar si Fase 0 del plan mide otra cosa en producción.
const XLSX_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

function originalFileField(name) {
  return {
    name,
    type: "file",
    required: false,
    maxSelect: 1,
    maxSize: 26214400,
    mimeTypes: XLSX_MIME_TYPES,
    protected: false,
    thumbs: null,
  };
}

const NEW_FIELDS = [originalFileField("original_file_a"), originalFileField("original_file_b")];

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

  console.log(`Aplicando migración de archivos originales contra ${url}...\n`);

  const collection = await pb.collections.getOne("submissions");
  const existingNames = new Set(collection.fields.map((f) => f.name));
  const newFields = NEW_FIELDS.filter((f) => !existingNames.has(f.name));

  if (newFields.length === 0) {
    console.log("submissions: original_file_a/original_file_b ya existen, nada que hacer.");
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
