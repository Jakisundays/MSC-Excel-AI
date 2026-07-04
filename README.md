# MSC Excel AI

Frontend en **Next.js (App Router)** que reemplaza la UI Streamlit del proyecto Verito.
Autenticación + base de datos con **PocketBase** (en **Pockethost**). El envío de correo
sigue viviendo en el **orchestrator (FastAPI)** del Droplet; este frontend lo consume.

## Arquitectura

```
Navegador ─(1) filtra Excel (SheetJS) ─(2) pide ticket a Next.js ─(3) sube DIRECTO al orchestrator
          └─(4) registra metadata en PocketBase (vía route handler de Next.js)
```

- Los archivos **no pasan por Vercel** (límite ~4.5MB): el navegador los sube directo
  al orchestrator con un **ticket JWT** firmado por Next.js.
- PocketBase guarda solo **metadata** del historial (colección `submissions`).
- Auth con **Google OAuth2** (flujo authorization-code, cookie httpOnly, SSR).

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
  login/page.tsx                 # login con Google
  api/auth/{login,callback,logout}/route.ts
  api/upload-ticket/route.ts     # emite el ticket JWT (server)
  api/submissions/route.ts       # registra metadata en PB (server)
  (app)/{dashboard,nueva-solicitud,historial}/  # rutas protegidas
lib/
  pocketbase/server.ts           # cliente PB por request + cookie
  ticket.ts                      # firma JWT (jose)
  excel.ts                       # SheetJS: leer hojas + filtrar
  env.ts                         # envs + allowlist
middleware.ts                    # gate de sesión (edge)
components/                      # Nav, NewRequestForm
```

Ver [SETUP.md](SETUP.md) para configuración de PocketBase, Google OAuth, Vercel y el orchestrator.
