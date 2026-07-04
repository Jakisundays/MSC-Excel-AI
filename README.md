# MSC Excel AI

Frontend en **Next.js (App Router)** que reemplaza la UI Streamlit del proyecto Verito.
Autenticación + base de datos con **PocketBase** (hoy alojado en Railway — ver
`.env.local`/`POCKETBASE_URL` para la URL real, no asumir un proveedor fijo acá).
El envío de correo sigue viviendo en el **orchestrator (FastAPI)** del repo `verito`;
este frontend lo consume y es el **único servicio con credenciales de PocketBase**.

## Arquitectura

```
Navegador ─(1) filtra Excel (SheetJS) ─(2) pide ticket a Next.js ─(3) sube DIRECTO al orchestrator
          └─(4) registra metadata en PocketBase (vía route handler de Next.js)

Orchestrator ─(email)─> AI Excel Agent externo ─(async, webhook firmado)─>
Orchestrator ─(reenvío firmado + reintentos)─> Next.js /api/webhooks/processing-result
          └─(5) actualiza status/result_file en PocketBase ─> realtime en /historial/[id]
```

- Los archivos **no pasan por Vercel** (límite ~4.5MB): el navegador los sube directo
  al orchestrator con un **ticket JWT** firmado por Next.js.
- PocketBase guarda solo **metadata** del historial (colección `submissions`) —
  schema versionado en [`pb_migrations/`](pb_migrations/README.md).
- Auth con **Google OAuth2** (flujo authorization-code, cookie httpOnly, SSR) **o**
  login por email+contraseña (`/api/auth/login-password`, con rate limiting).
- El cierre del procesamiento llega async por webhook (HMAC + idempotencia) —
  contrato completo en `docs/openapi-webhook.yaml` y
  `verito/docs/procesamiento-async-webhook-plan.md`. Un cron (`/api/cron/mark-stale`)
  marca como `failed` las solicitudes huérfanas después de 48h, y otro
  (`/api/cron/keep-alive`) evita que PocketBase hiberne por inactividad.

## Quickstart (local)

```bash
npm install
cp .env.example .env.local   # completar valores
npm run dev                  # http://localhost:3100
```

### Modo preview (sin PocketBase ni Google)

Para navegar y mostrar toda la UI sin backend, poné en `.env.local`:

```env
NEXT_PUBLIC_DEV_PREVIEW=true
```

Esto **solo funciona con `next dev`** (nunca en producción): falsea la sesión,
simula la subida al orchestrator y muestra datos de historial de ejemplo. Ideal
para iterar la interfaz antes de tener la base de datos lista.

Necesitás:
1. Una instancia de **Pockethost** con Google OAuth y la colección `submissions` (ver [SETUP.md](SETUP.md)).
2. El **orchestrator** accesible por **https** (en local podés apuntar a la URL pública del Droplet).
3. `UPLOAD_TICKET_SECRET` **idéntico** en este frontend y en el orchestrator.

## Estructura

```
app/
  login/{page,login-view}.tsx            # login (Google + password)
  api/auth/{login,login-password,callback,logout}/route.ts
  api/upload-ticket/route.ts             # emite el ticket JWT (server)
  api/submissions/{route,[id]/route}.ts  # crea/actualiza metadata en PB (server)
  api/webhooks/processing-result/route.ts  # webhook de cierre (HMAC + idempotencia)
  api/cron/{mark-stale,keep-alive}/route.ts
  api/profile/{route,delete,export,password}.ts
  (app)/{dashboard,nueva-solicitud,historial,historial/[id]}/  # rutas protegidas
  perfil/{page,cuenta,privacidad,seguridad}/page.tsx
lib/
  pocketbase/{server,admin,types}.ts     # cliente PB por request + cookie / superusuario
  ticket.ts                              # firma JWT (jose)
  excel.ts                               # SheetJS (lazy-loaded): leer hojas + filtrar
  env.ts                                 # envs + allowlist
  constants.ts, rate-limit.ts, webhooks/hmac.ts
middleware.ts                            # gate de sesión (edge)
components/                              # app-sidebar, NewRequestForm, submissions-table, etc.
pb_migrations/                           # snapshot versionado del schema real de PocketBase
scripts/export-pb-schema.mjs             # npm run export:pb-schema
```

Scripts: `npm run dev|build|start|lint|typecheck|export:pb-schema`. CI en
`.github/workflows/ci.yml` corre `typecheck` + `lint` + `build` en cada push/PR.

Ver [SETUP.md](SETUP.md) para configuración de PocketBase, Google OAuth, Vercel y el orchestrator.
