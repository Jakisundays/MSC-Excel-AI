# Setup — MSC Excel AI

Guía paso a paso para dejar el sistema funcionando: PocketBase, Google OAuth,
el frontend (Vercel) y el orchestrator.

> **Actualizado 2026-07-04** tras la auditoría técnica + remediación: el
> schema real de `submissions` tiene más campos que los que este documento
> listaba antes (se agregaron en la Fase 2 del webhook de cierre), y el
> orchestrator ahora exige una credencial para su webhook de entrada — ver
> §3.2 más abajo, es un cambio que **rompe el flujo si no se configura**.

---

## 1. PocketBase

1. Crear/usar una instancia de PocketBase (hoy corre en Railway; podría ser
   cualquier host que sirva la API de PocketBase — Pockethost, un droplet
   propio, etc.). Anotá la URL real.
2. Entrar al **panel admin** (`{URL}/_/`) y crear el superusuario.

### 1.1 Colección `submissions`

**Recomendado**: en vez de crear los campos a mano, usar el snapshot ya
versionado del schema real: Panel → Settings → Import collections → pegar
el contenido de [`pb_migrations/schema_snapshot.json`](pb_migrations/schema_snapshot.json)
(ver [`pb_migrations/README.md`](pb_migrations/README.md) para regenerarlo
con `npm run export:pb-schema` si el schema cambió desde entonces).

Si preferís crearla a mano, estos son los campos reales (confirmado contra
la instancia de producción el 2026-07-04):

| Campo | Tipo | Opciones |
|---|---|---|
| `user` | relation | colección `users`, **required**, maxSelect 1, **cascadeDelete: true** |
| `file_a_name` / `file_b_name` | text | |
| `sheet_a` / `sheet_b` | text | |
| `file_a_size` / `file_b_size` | number | |
| `reply_to` | json | |
| `orchestrator_request_id` | text | **índice único parcial** (`WHERE orchestrator_request_id != ''`) — necesario para que el webhook de cierre no pueda resolver contra el registro equivocado |
| `attachments` | json | |
| `status` | select | valores: `pending`, `processing`, `completed`, `failed` (ya no `sent`) |
| `error` | text | |
| `result_file` | file | mimetypes `.xlsx`/`.xls`, tamaño máx. razonable (ej. 20MB) |
| `result_file_size` | number | |
| `processing_started_at` | date | |
| `completed_at` | date | habilita la KPI "Respuesta prom." del dashboard |
| `ai_agent_job_id` | text | opcional, trazabilidad hacia el proveedor externo |
| `history` | json | array de `{at, from, to, note}`, trazabilidad de transiciones |

(`created` / `updated` los agrega PocketBase como autodate.)

### 1.2 API Rules de `submissions`

```
List/Search rule:   @request.auth.id != "" && user = @request.auth.id
View rule:          @request.auth.id != "" && user = @request.auth.id
Create rule:        @request.auth.id != "" && @request.body.user = @request.auth.id
Update rule:        @request.auth.id != "" && user = @request.auth.id
Delete rule:        (vacío = nadie, o solo admin)
```

Nota: el webhook de cierre (`/api/webhooks/processing-result`) y el cron de
SLA (`/api/cron/mark-stale`) escriben con credenciales de superusuario
(`lib/pocketbase/admin.ts`), así que estas reglas de usuario normal no los
afectan — un usuario nunca puede auto-marcarse `completed` vía la API pública.

### 1.3 Google OAuth en `users`

1. En **Google Cloud Console** → APIs & Services → Credentials → *Create OAuth client ID* (tipo *Web application*).
2. **Authorized redirect URIs**: **NO** es el redirect de PocketBase (`/api/oauth2-redirect`) — este frontend usa su propio callback
   (`app/api/auth/login/route.ts` arma `redirectUrl = \`${APP_URL}/api/auth/callback\`` y se lo pasa directo a Google,
   sin pasar por el endpoint nativo de PocketBase). Agregá **una entrada por cada `APP_URL` que uses**:
   - Local: `http://localhost:3100/api/auth/callback` (o el puerto que uses)
   - Producción: `https://tu-dominio.vercel.app/api/auth/callback`

   Las dos pueden convivir en la misma lista de Google sin problema. Si te da
   `Error 400: redirect_uri_mismatch`, es casi siempre esto: el valor de
   `APP_URL` en el `.env` que estés usando no coincide (exacto, sin barra
   final) con ninguna de las URIs autorizadas acá.
3. En PocketBase → colección `users` → *Options* → **OAuth2** → habilitar **Google** y pegar Client ID + Secret.

---

## 2. Frontend (local y Vercel)

### 2.1 Variables de entorno

| Var | Dónde | Valor |
|---|---|---|
| `NEXT_PUBLIC_POCKETBASE_URL` | local + Vercel | URL real de PocketBase |
| `POCKETBASE_URL` | local + Vercel | misma URL |
| `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` | local + Vercel | superusuario — usado por `lib/pocketbase/admin.ts` (webhook de cierre, cron) y por `npm run export:pb-schema` |
| `NEXT_PUBLIC_ORCHESTRATOR_URL` | local + Vercel | `https://api-correo.tudominio.com` |
| `APP_URL` | local + Vercel | local: `http://localhost:3100` · prod: dominio de Vercel |
| `UPLOAD_TICKET_SECRET` | local + Vercel + orchestrator | **el mismo en los tres** — generar con `openssl rand -base64 48` |
| `RESULT_WEBHOOK_SECRET` | local + Vercel + orchestrator | **el mismo en los tres**, DISTINTO de `UPLOAD_TICKET_SECRET` — firma el webhook de cierre (§3.2) |
| `CRON_SECRET` | local + Vercel | autoriza `/api/cron/mark-stale` y `/api/cron/keep-alive` — Vercel lo manda solo si esta env existe |
| `ALLOWED_EMAIL_DOMAINS` | local + Vercel | opcional, ej. `dinardi.com.ar,witworks.cloud` |
| `ALLOWED_EMAILS` | local + Vercel | opcional, emails sueltos |

### 2.2 Local

```bash
npm install
cp .env.example .env.local   # completar
npm run dev
```

### 2.3 Vercel

1. Importar el repo en Vercel.
2. Cargar todas las envs de arriba (con `APP_URL` = dominio final de Vercel).
3. Deploy. Actualizar `APP_URL` si cambia el dominio.

---

## 3. Orchestrator (repo `verito`, servicio separado)

### 3.1 HTTPS (obligatorio)

El navegador en `https://...vercel.app` no puede llamar a `http://...:8071`
(mixed content). Poner el orchestrator detrás de un reverse proxy con TLS.
Ejemplo con **Caddy** (`/etc/caddy/Caddyfile`):

```
api-correo.tudominio.com {
    reverse_proxy localhost:8071
}
```

### 3.2 Variables del `.env` del orchestrator

```env
UPLOAD_TICKET_SECRET=<el mismo que en Vercel>
REQUIRE_UPLOAD_TICKET=true       # true en producción; false solo mientras convive con el Streamlit viejo
CORS_ALLOWED_ORIGINS=https://<tu-app>.vercel.app,https://app.tudominio.com   # sin esto, CORS queda cerrado (fail-closed)
MAIL_RECIPIENTS=cmatch.ia@witworks.cloud,jacob@dinardi.com.ar

RESULT_WEBHOOK_URL=https://<tu-app>.vercel.app/api/webhooks/processing-result
RESULT_WEBHOOK_SECRET=<el mismo que en Vercel, DISTINTO de UPLOAD_TICKET_SECRET>

# CRÍTICO — sin al menos una de estas dos, /webhooks/ai-excel-agent responde
# 503 a TODO callback del proveedor (fail-closed desde la auditoría 2026-07-04,
# ver orchestrator/webhook_security.py). El flujo de cierre no funciona sin esto:
AI_AGENT_WEBHOOK_SECRET=<si el proveedor puede firmar HMAC>
AI_AGENT_INBOUND_API_KEY=<alternativa mas simple: header X-Api-Key estatico>
AI_AGENT_API_KEY=<Bearer para descargar result_url si el proveedor lo pide>

# Opcional, recomendado: alerta a Slack/Discord si se agotan los reintentos
# del reenvío hacia Next.js.
OPS_ALERT_WEBHOOK_URL=
```

### 3.3 Dependencias

```bash
pip install -r orchestrator/requirements.txt
python -m pytest orchestrator/   # 37 tests deberían pasar antes de desplegar
```

### 3.4 Cutover

- Mientras el Streamlit viejo siga vivo: `REQUIRE_UPLOAD_TICKET=false`
  (acepta requests con o sin ticket; si hay ticket, suma el email del usuario).
- Cuando el frontend nuevo esté validado: `REQUIRE_UPLOAD_TICKET=true`
  (exige ticket) y dar de baja el Streamlit.
- Confirmar con el proveedor externo del AI Excel Agent qué credencial de
  §3.2 va a usar (HMAC o API key) antes del cutover — sin coordinarlo, sus
  callbacks van a rebotar con 503.

---

## 4. Smoke test end-to-end

1. Login con Google (cuenta permitida por la allowlist) o con email+contraseña.
2. Subir 2 Excel, elegir hoja en cada uno, agregar un email reply-to.
3. Enviar → la solicitud queda `pending` en PocketBase (creada ANTES de llamar
   al orchestrator) → el equipo recibe el correo (destinatarios fijos + tu
   email) → pasa a `processing`.
4. Simular (o esperar) el callback real del AI Agent hacia
   `/webhooks/ai-excel-agent` → confirmar que **Historial** actualiza el
   estado a `completed`/`failed` en vivo (realtime) y que el botón
   "Descargar resultado" funciona cuando `completed`.
5. Verificar que `/api/cron/mark-stale` y `/api/cron/keep-alive` responden
   200 con el header `Authorization: Bearer <CRON_SECRET>` (Vercel lo manda
   solo automáticamente si el cron está dado de alta en `vercel.json` y
   `CRON_SECRET` existe).
