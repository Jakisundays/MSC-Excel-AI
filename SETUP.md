# Setup — MSC Excel AI

Guía paso a paso para dejar el sistema funcionando: PocketBase (Pockethost),
Google OAuth, el frontend (Vercel) y el orchestrator (Droplet).

---

## 1. PocketBase en Pockethost

1. Crear una instancia en https://pockethost.io (anotá la URL, ej. `https://msc-excel-ai.pockethost.io`).
2. Entrar al **panel admin** (`{URL}/_/`) y crear el admin.

### 1.1 Colección `submissions`

Crear una colección **base** llamada `submissions` con estos campos:

| Campo | Tipo | Opciones |
|---|---|---|
| `user` | relation | colección `users`, **required**, maxSelect 1 |
| `file_a_name` | text | |
| `file_b_name` | text | |
| `sheet_a` | text | |
| `sheet_b` | text | |
| `reply_to` | json | |
| `orchestrator_request_id` | text | |
| `attachments` | json | |
| `status` | select | valores: `pending`, `sent`, `failed` |
| `error` | text | |

(`created` / `updated` los agrega PocketBase como autodate.)

### 1.2 API Rules de `submissions`

```
List/Search rule:   @request.auth.id != "" && user = @request.auth.id
View rule:          @request.auth.id != "" && user = @request.auth.id
Create rule:        @request.auth.id != "" && @request.data.user = @request.auth.id
Update rule:        @request.auth.id != "" && user = @request.auth.id
Delete rule:        (vacío = nadie, o solo admin)
```

### 1.3 Google OAuth en `users`

1. En **Google Cloud Console** → APIs & Services → Credentials → *Create OAuth client ID* (tipo *Web application*).
2. **Authorized redirect URIs**: agregá el redirect de PocketBase:
   `https://msc-excel-ai.pockethost.io/api/oauth2-redirect`
3. En PocketBase → colección `users` → *Options* → **OAuth2** → habilitar **Google** y pegar Client ID + Secret.

> El frontend usa el flujo authorization-code y su propio callback
> (`/api/auth/callback`); PocketBase hace de intermediario con Google.

---

## 2. Frontend (local y Vercel)

### 2.1 Variables de entorno

| Var | Dónde | Valor |
|---|---|---|
| `NEXT_PUBLIC_POCKETBASE_URL` | local + Vercel | URL de Pockethost |
| `POCKETBASE_URL` | local + Vercel | misma URL |
| `NEXT_PUBLIC_ORCHESTRATOR_URL` | local + Vercel | `https://api-correo.tudominio.com` |
| `APP_URL` | local + Vercel | local: `http://localhost:3000` · prod: dominio de Vercel |
| `UPLOAD_TICKET_SECRET` | local + Vercel + Droplet | **el mismo en los tres** — generar con `openssl rand -base64 48` |
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

## 3. Orchestrator (Droplet)

El orchestrator ya está desplegado; solo necesita 3 cambios **aditivos**
(ya implementados en el repo `verito`):

### 3.1 HTTPS (obligatorio)

El navegador en `https://...vercel.app` no puede llamar a `http://...:8071`
(mixed content). Poner el orchestrator detrás de un reverse proxy con TLS.
Ejemplo con **Caddy** (`/etc/caddy/Caddyfile`):

```
api-correo.tudominio.com {
    reverse_proxy localhost:8071
}
```

### 3.2 Variables nuevas (`.env` del orchestrator)

```env
UPLOAD_TICKET_SECRET=<el mismo que en Vercel>
REQUIRE_UPLOAD_TICKET=false      # poner true en el cutover final
CORS_ALLOWED_ORIGINS=https://<tu-app>.vercel.app,https://app.tudominio.com
MAIL_RECIPIENTS=cmatch.ia@witworks.cloud,jacob@dinardi.com.ar
```

### 3.3 Dependencias

```bash
pip install -r orchestrator/requirements.txt   # ahora incluye PyJWT
```

### 3.4 Cutover

- Mientras el Streamlit viejo siga vivo: `REQUIRE_UPLOAD_TICKET=false`
  (acepta requests con o sin ticket; si hay ticket, suma el email del usuario).
- Cuando el frontend nuevo esté validado: `REQUIRE_UPLOAD_TICKET=true`
  (exige ticket) y dar de baja el Streamlit.

---

## 4. Smoke test end-to-end

1. Login con Google (cuenta permitida por la allowlist).
2. Subir 2 Excel, elegir hoja en cada uno, agregar un email reply-to.
3. Enviar → el equipo recibe el correo (destinatarios fijos + tu email).
4. Ver la solicitud en **Historial** con estado `sent`.
