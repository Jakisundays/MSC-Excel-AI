# Plan: notificaciones de cierre de procesamiento ("Nueva Solicitud" lista)

Estado: **propuesta, sin implementar** (jul 2026). Documento de análisis y
diseño — ningún código fue modificado al escribirlo. Verificado contra el
código real de los dos repos hermanos:

- `MSC Excel AI` — frontend Next.js 15 + PocketBase (Vercel + Railway).
- `verito/orchestrator` — API FastAPI stateless en un Droplet (sin cola,
  sin DB propia), puente entre Next.js y el AI Excel Agent externo.

## 0. Arquitectura actual verificada (línea base)

```
Usuario                Next.js (Vercel)          orchestrator (Droplet)      AI Agent externo
  │  1. Sube 2 excel       │                              │                        │
  ├──POST /api/submissions─▶ crea submission "pending"    │                        │
  ├──POST /api/upload-ticket▶ firma JWT corto (lib/ticket.ts)                      │
  ├──POST {orchestratorUrl}/uploadfiles (DIRECTO, sin pasar por Vercel)──▶         │
  │                         │                    envía email con Ref ID ──────────▶│
  ├──PATCH /api/submissions/{id}▶ status="processing"      │                       │
  │                         │                              │   (minutos/horas, fuera de nuestro control)
  │                         │                              │◀── callback POST /webhooks/ai-excel-agent
  │                         │◀── POST /api/webhooks/processing-result (HMAC, reintentos [0,1,4,9]s)
  │                         │  escribe status=completed|failed, result_file
  │  (hoy) polling 5s ──────▶ GET vía router.refresh()      │                       │
```

Hechos clave que condicionan todo el diseño:

1. **El orchestrator es stateless** (`orchestrator/main.py`, `result_forwarder.py`):
   no tiene cola, no tiene DB, no espera al AI Agent. Solo reenvía el
   callback de cierre a Next.js con firma HMAC y reintentos acotados
   (`[0,1,4,9]s`, solo ante 5xx/timeout, nunca ante 4xx). Ya tiene alerta
   operativa a Slack/Discord si el reenvío agota reintentos
   (`OPS_ALERT_WEBHOOK_URL`).
2. **`submissions` (PocketBase)** ya tiene todo el modelo de estado necesario:
   `status(pending|processing|completed|failed)`, `result_file`, `error`,
   `processing_started_at`, `completed_at`, `ai_agent_job_id`, `history[]`.
   `updateRule: user = @request.auth.id` — solo el dueño o un cliente admin
   (server-to-server) puede escribir.
3. **El frontend NO usa el realtime nativo de PocketBase**, por decisión de
   seguridad ya tomada y documentada en código
   (`components/submission-realtime.tsx`): el token de sesión vive en
   cookie `httpOnly` para protegerse de XSS, y exponerlo a JS del cliente
   solo para esta mejora de UX "no vale la pena". Hoy usa **polling cada
   5s** (`setInterval(() => router.refresh(), 5000)`) mientras el estado no
   sea terminal.
4. **Cero notificaciones push hoy.** Solo: toasts efímeros (`sonner`) y un
   único canal de email — `lib/mailer.ts:sendMail()` — que reusa el SMTP
   del orchestrator vía `POST /send-invitation-email` (endpoint genérico:
   recibe `to/subject/body_html`, pese al nombre no es exclusivo de
   invitaciones). **No hay `web-push`, `service worker`, `socket.io`,
   `pusher` ni `firebase` en `package.json`.**
5. **Vercel es serverless**: sin conexiones persistentes de larga duración.
   El único cron existente (`vercel.json` → `/api/cron/mark-stale`, diario)
   ya marca submissions huérfanas por SLA vencido.
6. **Hallazgo pendiente sin cerrar** (`docs/e2e-testing-findings.md`): el
   webhook de cierre puede tener una carrera si dos callbacks para el mismo
   `request_id` llegan casi simultáneos, sin locking. Este plan **resuelve
   esa carrera como efecto colateral** (ver §6).

---

## 1. Arquitectura recomendada

**Híbrida, con un único punto de disparo, sin infraestructura nueva de
terceros (nada de Firebase/OneSignal/Pusher):**

| Canal | Cuándo se usa | Infra nueva |
|---|---|---|
| **Web Push (VAPID + Service Worker)** | App cerrada/en background — el requisito central del usuario | `web-push` (npm), 1 service worker, 2 colecciones PocketBase |
| **Centro de notificaciones in-app** | Usuario vuelve a la app más tarde, o tuvo push deshabilitado | 1 colección PocketBase, 1 componente UI |
| **Email de respaldo** | Siempre para `failed`; opcional para `completed` si no hay push activo | **Cero infra nueva** — reusa `sendMail()` tal cual existe hoy |
| **Polling en pestaña abierta** | Vivo mientras el tab está abierto y visible | Mejora menor del código existente, no reemplazo |

**Por qué NO WebSockets/SSE con servidor propio:** implicaría correr un
proceso stateful nuevo (viable técnicamente en el Droplet, que sí es
always-on, a diferencia de Vercel) solo para bajar la latencia de "está
listo" de ~5s (polling) a instantáneo mientras el tab sigue abierto. El
producto es B2B, hoy procesado en volumen bajo (revisar
`[[project_verito_nextjs_pocketbase]]`: el AI Agent externo aún es 100%
manual del lado del proveedor) — no justifica operar un segundo servicio
con reconexión, con estado de conexiones y escalado propio. Se reconsidera
solo si el producto agrega una barra de progreso en vivo (%) que sí
necesite granularidad continua, no un evento binario "terminado/no".

**Por qué NO reactivar el realtime nativo de PocketBase (por ahora):** es
la opción "más barata" en abstracto (ya está en el SDK, ya corre en
Railway 24/7), pero exponer el token real de sesión al cliente choca
directamente con la decisión de seguridad ya tomada y documentada en
`submission-realtime.tsx`. Existe un camino intermedio — un "ticket" de
PocketBase de vida cortísima y de solo-lectura, análogo al patrón que ya
usa `lib/ticket.ts` para el upload — pero es un cambio de modelo de
autenticación, no un bolt-on, y no resuelve el requisito central (app
cerrada). Se documenta como alternativa futura en §11, no como parte de
este plan.

**Punto único de disparo:** toda notificación (push + email + registro
in-app) se dispara desde **una sola función server-side**,
`lib/notify.ts:notifySubmissionResult(submission)`, llamada desde **dos**
lugares únicamente:
- `POST /api/webhooks/processing-result` (cierre normal), y
- `/api/cron/mark-stale` (cierre por timeout/SLA).

Esto evita que cada canal tenga su propia lógica de "cuándo disparar" y
que diverjan con el tiempo.

---

## 2. Cambios necesarios

### 2.1 Frontend (`MSC Excel AI`)

**Nuevo:**
- `public/sw.js` — service worker: escucha `push` (muestra
  `showNotification`) y `notificationclick` (enfoca/abre
  `/historial/{id}`).
- `lib/push-client.ts` — helpers de cliente: registrar SW, pedir permiso
  (`Notification.requestPermission()`, **solo tras un gesto explícito del
  usuario**, nunca al cargar la página), suscribir
  (`pushManager.subscribe`), enviar la suscripción al backend.
- `app/api/push/subscribe/route.ts` (POST) — recibe el `PushSubscription`
  del cliente, upsert en `push_subscriptions` por `endpoint`, usuario
  **derivado de la sesión** (nunca del body, mismo patrón de ownership que
  ya usa `PATCH /api/submissions/[id]`).
- `app/api/push/unsubscribe/route.ts` (POST/DELETE) — borra la suscripción
  (usuario da de baja desde `/perfil`, o el propio SW la reporta inválida).
- `app/api/notifications/route.ts` (GET) — lista/pagina notificaciones del
  usuario + marcar-como-leída, para el centro in-app.
- `lib/notify.ts` (server-only) — `notifySubmissionResult()`: orquesta los
  3 canales, con el gate de una sola disparada (§6).
- `lib/mailer.ts` — nueva función `submissionResultEmailHtml()` (mismo
  patrón que `invitationEmailHtml()` ya existente); **no hace falta tocar
  `sendMail()` ni el orchestrator**, ya acepta subject/html arbitrario.
- UI: ícono de campana + badge de no-leídas en la barra lateral
  (`components/app-sidebar.tsx`), panel desplegable con la lista; toggle
  "Notificaciones del navegador" en `/perfil` (nuevo bloque, mismo lugar
  que Cuenta/Privacidad); banner de opt-in discreto la primera vez que el
  usuario crea una solicitud ("avisate cuando esté lista" con botón
  Activar/Ahora no).

**Modificado:**
- `app/api/webhooks/processing-result/route.ts` — al final del branch que
  efectivamente transiciona a estado terminal (no en el branch
  `already_processed`), llamar `notifySubmissionResult(submission)`.
- `app/api/cron/mark-stale/route.ts` — al marcar una submission como
  huérfana/timeout, también llamar `notifySubmissionResult()` (variante
  "tardó más de lo esperado").
- `components/submission-realtime.tsx` — mejora menor y de bajo riesgo:
  pausar el `setInterval` con la Page Visibility API cuando el tab no está
  visible (ahorra requests, batería), y usar `BroadcastChannel` para que,
  si el usuario tiene 2+ pestañas del mismo `/historial/{id}` abiertas,
  solo una dispare el toast/reconsulta y difunda el resultado a las demás
  (ver §5).

### 2.2 Backend (`verito/orchestrator`)

**Ningún cambio necesario.** El endpoint `POST /send-invitation-email` ya
es genérico (`to`, `subject`, `body_html`) y ya tiene su secreto
(`INVITATION_EMAIL_SECRET`) y su fail-closed. El resto de la lógica de
push/email/in-app vive enteramente en Next.js, disparada desde el webhook
de cierre que **ya existe**. Esto es intencional: mantiene al orchestrator
como lo que es hoy (gateway stateless), sin sumarle responsabilidad de
producto.

### 2.3 Base de datos (PocketBase) — nuevas migraciones en `pb_migrations/`

**Colección `push_subscriptions`** (nueva):

| Campo | Tipo | Notas |
|---|---|---|
| `user` | relation → users | cascade delete |
| `endpoint` | text | único (índice único) |
| `keys_p256dh` | text | del `PushSubscription.toJSON()` |
| `keys_auth` | text | ídem |
| `user_agent` | text | para debug/soporte, mostrar "Chrome en Mac" en `/perfil` |
| `last_seen_at` | autodate | se refresca en cada re-suscripción |

`listRule`/`viewRule`: `user = @request.auth.id` (nadie ve suscripciones
ajenas, ni siquiera compañeros de empresa). `createRule`/`updateRule`:
solo vía cliente admin desde la ruta de Next.js (mismo patrón que
`submissions` para el webhook).

**Colección `notifications`** (nueva):

| Campo | Tipo | Notas |
|---|---|---|
| `user` | relation → users | a quién se le muestra |
| `company` | relation → companies | denormalizado, para filtros futuros |
| `submission` | relation → submissions | de qué solicitud habla |
| `type` | select | `submission_completed` \| `submission_failed` \| `submission_timeout` |
| `read_at` | date (nullable) | null = no leída |

`listRule`/`viewRule`: `user = @request.auth.id`. Solo el cliente admin
escribe.

**Campo nuevo en `submissions`:**

- `notified_at` — date, nullable. Gate de una sola disparada (§6); se
  setea en el mismo `patch` que mueve `status` a terminal.

---

## 3. Flujo completo, de punta a punta

1. Usuario llena el formulario de Nueva Solicitud y envía → se crea
   `submissions` con `status=pending` (patrón ya existente: registrar
   antes de subir, para no perder la solicitud si el navegador se cierra
   a mitad de camino).
2. Navegador sube directo al orchestrator (Droplet) → `status=processing`.
3. **(Nuevo, opcional, un solo momento)** si el usuario nunca activó
   notificaciones del navegador, se le muestra el banner de opt-in aquí
   ("avisate cuando esté lista"). Si acepta: el SW se registra (si no
   existe), pide permiso, se suscribe y `POST /api/push/subscribe` guarda
   la suscripción.
4. Usuario puede quedarse mirando (polling cada 5s sigue funcionando
   igual) o **cerrar la pestaña / el navegador / apagar la laptop**.
5. El AI Agent externo procesa (minutos u horas), llama al orchestrator,
   que reenvía firmado a `POST /api/webhooks/processing-result`.
6. Next.js valida firma + idempotencia (ya existente), escribe
   `status=completed|failed`, `result_file`, `completed_at`, y en el mismo
   flujo (branch de transición real, no el de "ya procesado") llama
   `notifySubmissionResult(submission)`, que:
   a. Setea `notified_at=now()` **antes** de disparar nada (gate, §6).
   b. Busca `push_subscriptions` del `submission.user` → `web-push` a
      cada una. 404/410 → borra la suscripción vieja.
   c. Crea un row en `notifications` (para el centro in-app).
   d. Envía el email de respaldo vía `sendMail()` (siempre si `failed`;
      si `completed`, según la preferencia del usuario — ver §7 decisión
      pendiente).
7. **Si el usuario sigue con el tab abierto**: el polling existente lo
   entera en ≤5s igual que hoy (este plan no lo reemplaza, solo lo mejora
   con Visibility API).
8. **Si el usuario cerró todo**: el navegador (Chrome/Firefox/Edge/Safari
   16.4+ como PWA instalada) despierta el service worker en background,
   muestra la notificación nativa del SO. Clic → abre/enfoca
   `/historial/{id}`.
9. **Si no hay push activo o falló**: el usuario ve el resultado la
   próxima vez que entra, vía el badge de la campana (in-app) y/o el
   email que le llegó mientras tanto.

---

## 4. Registro y administración de dispositivos/navegadores

- Cada suscripción (`endpoint` + claves) es un row en `push_subscriptions`,
  ligado al `user`. El `endpoint` (URL única que asigna el navegador al
  suscribirse) es efectivamente el ID del dispositivo/navegador — se
  garantiza unicidad con índice único en PocketBase.
- Alta: `POST /api/push/subscribe` hace upsert por `endpoint` (si ya
  existe, solo refresca `last_seen_at` y las claves si cambiaron —
  algunos navegadores rotan el endpoint periódicamente).
- Baja explícita: usuario ve en `/perfil` la lista de "dispositivos con
  notificaciones activas" (basado en `user_agent` + `last_seen_at`, ej.
  "Chrome en Mac — última vez hoy"), con botón "Desactivar" → `DELETE
  /api/push/unsubscribe` + `subscription.unsubscribe()` en el navegador
  actual si coincide.
- Baja automática: cualquier envío que devuelva `404`/`410` (el navegador
  o el usuario revocó el permiso a nivel de sistema operativo) borra el
  row inmediatamente — sin esto, la tabla acumula suscripciones muertas
  para siempre.

---

## 5. Múltiples dispositivos y múltiples pestañas

**Múltiples dispositivos** (celular + laptop, o 2 navegadores distintos):
cada uno tiene su propio `endpoint` → su propio row en
`push_subscriptions`. `notifySubmissionResult()` itera **todos** los rows
del usuario y le manda push a cada uno — comportamiento deseado (avisar en
todos los dispositivos donde el usuario dijo que quería avisos).

**Múltiples pestañas del mismo navegador:** la Push API está atada al
**origen + perfil de navegador**, no a la pestaña — todas las pestañas de
`msc.c-match.ai` en un mismo Chrome comparten un único service worker y
una única suscripción. Esto significa que el navegador entrega **un solo**
evento `push` sin importar cuántas pestañas haya abiertas: no hay
duplicado a nivel de push, es inherente a la plataforma, no requiere
lógica nuestra.

**Corrección tras revisar el código real (verificado tras escribir este
plan):** `components/submission-realtime.tsx` no dispara ningún toast ni
efecto visible al detectar la transición a terminal — solo hace
`router.refresh()` para que el server component se vuelva a renderizar. Es
decir, hoy **no hay nada que desduplicar entre pestañas** en el polling: no
hace falta `BroadcastChannel` para evitar un toast repetido, porque ese
toast no existe. La única mejora real y de bajo riesgo que se implementó en
la Fase 0 es pausar el `setInterval` con la Page Visibility API cuando el
tab no está visible (ahorra requests/batería) — se descartó
`BroadcastChannel` por no resolver un problema real hoy; si en el futuro se
agrega un toast en el detalle, ahí sí valdría la pena reconsiderarlo.

---

## 6. Evitar notificaciones duplicadas

Capas independientes, cada una cierra un vector distinto:

1. **Gate a nivel de dato** (el más importante): `submissions.notified_at`
   se lee-y-setea **dentro del mismo `patch` administrativo** que mueve
   `status` a terminal, antes de disparar cualquier canal. Si dos
   callbacks del orchestrator llegan casi simultáneos para el mismo
   `request_id` (el race condition ya anotado en
   `docs/e2e-testing-findings.md`), solo el primero que gana la escritura
   dispara `notifySubmissionResult()` — el segundo ve `notified_at` ya
   seteado y no reenvía nada. **Esto cierra, de paso, el hallazgo de la
   carrera pendiente** con el mismo mecanismo (chequeo optimista +
   escritura condicionada) que ya proponía `e2e-testing-findings.md`.
2. **Idempotencia ya existente aguas arriba**: el orchestrator ya dedupea
   por `(request_id, status)` (`idempotency.py`, TTL 24h) antes de siquiera
   reenviar a Next.js — los reintentos `[0,1,4,9]s` del `result_forwarder`
   normalmente ni siquiera llegan a duplicar la llamada al webhook.
3. **Push a nivel de plataforma**: como en §5, el navegador entrega un
   solo evento por suscripción — no hay "duplicado por pestaña".
4. **Tabs abiertas**: `BroadcastChannel` evita el toast repetido dentro
   del mismo navegador (§5).
5. **Email**: al vivir dentro de la misma función gateada por
   `notified_at`, se manda una sola vez por el mismo motivo que el punto 1
   — no hace falta lógica de dedupe propia del lado del email.

---

## 7. Seguridad, autenticación y permisos

- **VAPID keys**: par generado una vez (`npx web-push generate-vapid-keys`
  o equivalente). Privada → `VAPID_PRIVATE_KEY` (solo servidor, Vercel env
  var, nunca al cliente). Pública → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (está
  pensada para ser pública, es la mitad del esquema asimétrico).
- **Ownership, no confiar en el cliente**: `POST /api/push/subscribe`
  deriva el `user` de la sesión (cookie httpOnly), igual que ya hace
  `PATCH /api/submissions/[id]` — nunca acepta un `user_id` en el body.
- **Reglas de PocketBase** en las 2 colecciones nuevas: `viewRule`/
  `listRule` = `user = @request.auth.id`; escritura solo vía cliente admin
  (mismo patrón que `submissions` para el webhook de cierre) — ni
  compañeros de empresa ven las suscripciones o notificaciones de otro.
- **Sin PII sensible en el payload del push**: el payload de Web Push
  tiene un límite duro de ~4KB y, más importante, los SO suelen mostrar el
  contenido en la pantalla de bloqueo. Usar copy genérico ("Tu solicitud
  está lista para descargar" / "Tu solicitud #1234 falló") en vez de
  incluir nombres de archivo o destinatarios (`reply_to`) — que el usuario
  abra la app para ver el detalle. Mismo criterio de cuidado con PII que ya
  se aplicó en la auditoría de Buses Panamá.
- **El link de la notificación debe apuntar a `/historial/{id}` (requiere
  sesión)**, nunca a la URL directa de `result_file`: ese campo está
  configurado como `protected: false` en PocketBase (confirmado en
  `docs/original-files-storage-plan.md` — descargable sin token si se
  conoce la URL). No es una vulnerabilidad nueva que introduzca este plan,
  pero un push/email que reparta esa URL directa la expondría a cualquiera
  que reenvíe la notificación; la app ya gatea el acceso vía sesión antes
  de mostrar el link de descarga real.
- **Secreto server-to-server ya existente y reutilizado sin cambios**: el
  email de respaldo usa `sendMail()` → `INVITATION_EMAIL_SECRET` +
  `X-Api-Key`, exactamente el mismo canal ya auditado y en producción —
  no se abre ningún endpoint nuevo en el orchestrator.
- **Rate limiting**: aplicar el mismo criterio que ya existe en el
  orchestrator (`rate_limit.py`) a `POST /api/push/subscribe` (un usuario
  no debería poder crear cientos de suscripciones en loop).

---

## 8. Manejo de errores, reintentos, notificaciones deshabilitadas

| Situación | Manejo |
|---|---|
| Push devuelve `404`/`410` (suscripción muerta) | Borrar el row de `push_subscriptions` de inmediato — autolimpieza |
| Push devuelve `429` (rate limit del servicio push del navegador) | Reintentar con el mismo patrón de backoff ya usado en `result_forwarder.py` (`[0,1,4,9]s`), consistencia con el resto del sistema |
| Push devuelve `400`/`401`/`403` (VAPID mal configurado, payload inválido) | Loguear + reusar la alerta operativa ya existente (`OPS_ALERT_WEBHOOK_URL`) — no reintentar, es un error de config, no transitorio |
| Usuario nunca dio permiso, o lo **denegó** | `Notification.permission === "denied"`: los navegadores bloquean re-preguntar por diseño. La UI debe detectar esto y **no insistir** — mostrar instrucciones para reactivarlo manualmente desde ajustes del navegador, en vez de un botón que no hace nada |
| Navegador sin soporte de Push API (raro) | Feature-detect (`'serviceWorker' in navigator && 'PushManager' in window`) y **ocultar** la UI de opt-in — cae silenciosamente a email + centro in-app |
| Webhook de cierre nunca llega (fallo end-to-end, reintentos del orchestrator agotados) | Ya cubierto por el cron `mark-stale` existente — se extiende para que también llame `notifySubmissionResult()` con `type=submission_timeout`, así el usuario se entera igual en vez de que la solicitud quede "colgada" en silencio |
| Falla el envío de email (SMTP/orchestrator caído) | `sendMail()` ya no rompe el flujo que lo llama (retorna `false`, loguea) — mismo comportamiento que hoy con invitaciones; el registro en `notifications` (in-app) queda igual como respaldo |

---

## 9. Costos, escalabilidad, mantenimiento

- **Web Push: costo marginal cero.** No hay intermediario de pago (a
  diferencia de Firebase Cloud Messaging para Android o servicios como
  OneSignal/Pusher) — se firma con VAPID y se postea directo al servicio
  push del navegador del usuario (Google/Mozilla/Apple absorben ese costo
  de infraestructura). Sin factura recurrente nueva.
- **Email: costo marginal cero adicional** — reusa el Mailgun/SMTP ya
  contratado y ya usado para invitaciones, dentro de límites de volumen
  que hoy son bajos (procesamiento B2B, no masivo).
- **Storage**: `push_subscriptions` y `notifications` son tablas chicas
  y de bajo volumen de escritura (una fila por dispositivo, una por
  solicitud cerrada) — sin impacto de escala perceptible al volumen actual
  del producto.
- **Mantenimiento real**: rotar VAPID keys solo si se comprometen (no es
  rutina); la limpieza de suscripciones muertas es automática (§8); no hay
  un servicio nuevo que monitorear 24/7 (a diferencia de si se hubiera
  optado por WebSockets propios).

---

## 10. Estrategia de fases (de menor a mayor riesgo)

**Fase 0 — Gratis, sin infraestructura nueva.**
Mejoras al polling existente: Page Visibility API (pausar cuando el tab no
está visible) + `BroadcastChannel` (no duplicar toast entre pestañas).
Cambios acotados a `components/submission-realtime.tsx`. Riesgo mínimo,
no toca el modelo de datos ni el webhook.

**Fase 1 — Centro de notificaciones in-app + email de resultado.**
Nueva colección `notifications`, campo `notified_at` en `submissions`,
extensión del webhook de cierre y del cron `mark-stale` para escribir ahí
y mandar el email de respaldo (reusando `sendMail()` sin tocar el
orchestrator). **Resuelve de paso la carrera documentada en
`e2e-testing-findings.md`.** Sin service worker todavía — no es "push" de
sistema operativo, pero ya resuelve "me fui y cuando vuelvo me entero", y
es el terreno más seguro para probar el gate de una sola disparada antes
de sumarle un canal más.

**Fase 2 — Web Push real.**
VAPID + service worker + colección `push_subscriptions` + endpoints de
suscripción/baja + envío desde `notifySubmissionResult()`. Este es el que
cumple literalmente el requisito: notificación del sistema operativo con
la app cerrada. Se apoya en el gate y en el centro in-app ya construidos
en la Fase 1, así que llega con bajo riesgo incremental.

**Fase 3 — Refinamientos.**
Preferencias de canal por usuario en `/perfil` (qué combinación de
push/email/in-app quiere), listado de dispositivos con notificaciones
activas, y — si el producto lo pide más adelante — extender el alcance de
"a quién se le avisa" más allá del solicitante (ej. notificar también al
admin de la empresa). Ninguna decisión de esta fase es necesaria para que
las Fases 1-2 funcionen.

---

## 11. Alternativas evaluadas y por qué no se recomiendan ahora

- **WebSocket propio en el Droplet**: técnicamente posible (el Droplet no
  es serverless), pero es un servicio stateful nuevo para bajar una
  latencia que hoy es de ~5s con polling — no se justifica al volumen
  actual. Reconsiderar solo si se agrega progreso en vivo (%).
- **SSE reactivando el realtime nativo de PocketBase**: requeriría exponer
  el token real de sesión al cliente (o construir un "ticket" de PocketBase
  de vida cortísima, análogo a `lib/ticket.ts`) — un cambio de modelo de
  autenticación, no un bolt-on. Además no resuelve el requisito central
  (app cerrada). Queda como alternativa futura de "Fase 2.5" si algún día
  se decide invertir en bajar la latencia del polling en pestaña abierta,
  pero no reemplaza la necesidad de Web Push.
- **FCM/OneSignal/Pusher**: añadirían una dependencia de terceros y
  potencial costo recurrente para resolver algo que el estándar Web Push +
  VAPID ya resuelve sin vendor lock-in. Se descarta por la instrucción de
  reusar infraestructura existente antes que sumar componentes.
- **Push solo, sin email de respaldo**: se descarta como diseño único —
  Web Push depende de que el navegador siga vivo, de que el usuario no
  haya revocado el permiso, y no llega si el usuario cerró sesión en ese
  dispositivo. Para un proceso que puede tardar horas, el email es la
  garantía de que el aviso llega igual.

---

## Decisiones de producto pendientes (no técnicas, para el usuario)

1. ¿El email de "completado" se manda **siempre**, o solo si el usuario no
   tiene ninguna suscripción push activa (para no duplicar el aviso)? Este
   plan recomienda: siempre para `failed` (importante, no debería
   depender de que el push haya llegado), configurable para `completed`.
2. ¿Se notifica solo al `user` que creó la solicitud, o también a
   admins/owners de la `company` (para visibilidad de equipo, en línea con
   el Historial de equipo ya implementado)? Este plan asume **solo al
   solicitante** por default, dejando la ampliación a Fase 3.
3. Limitación de plataforma a comunicar al usuario final: **iOS Safari
   requiere que el sitio esté "instalado" como PWA en la pantalla de
   inicio** (iOS 16.4+) para recibir Web Push — en desktop (Chrome,
   Firefox, Edge, Safari macOS) funciona sin esa condición.
