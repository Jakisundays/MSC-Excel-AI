#!/usr/bin/env node
// Exporta (solo lectura) el schema real de PocketBase a pb_migrations/,
// para poder versionarlo y diffearlo en git — ver auditoría técnica
// 2026-07-03, hallazgo Alto 9 ("sin schema versionado, drift invisible").
//
// Uso: npm run export:pb-schema
// Lee POCKETBASE_URL/POCKETBASE_ADMIN_EMAIL/POCKETBASE_ADMIN_PASSWORD de
// .env.local. Solo hace GET (collections.getFullList) — nunca escribe
// nada en PocketBase.
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

// Colecciones internas de PocketBase (auth/OTP/MFA), iguales en cualquier
// instalación de la misma versión — no aportan nada al diff de schema de
// negocio, así que no se versionan acá.
const SYSTEM_COLLECTIONS = new Set([
  "_mfas",
  "_otps",
  "_externalAuths",
  "_authOrigins",
  "_superusers",
]);

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

  const all = await pb.collections.getFullList();
  const businessCollections = all.filter((c) => !SYSTEM_COLLECTIONS.has(c.name));

  const outDir = path.join(projectRoot, "pb_migrations");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "schema_snapshot.json");
  fs.writeFileSync(outPath, JSON.stringify(businessCollections, null, 2) + "\n");

  console.log(`Schema exportado (${businessCollections.length} colecciones) -> ${outPath}`);
  console.log("Revisá el diff con git antes de commitear si venís de correr esto tras un cambio.");
}

main().catch((err) => {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
});
