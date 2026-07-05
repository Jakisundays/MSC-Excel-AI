# Hallazgos de la etapa de pruebas E2E (jul 2026)

Contexto: al escribir la suite de tests (orchestrator pytest + Vitest +
Playwright, ver `README.md`/`package.json` para cómo correrla) surgieron
un par de cosas que **no** se tocaron porque implican una decisión de
arquitectura con trade-offs reales, no un bug de bajo riesgo. Documentadas
acá para decidir, no decididas unilateralmente.

Lo que SÍ se corrigió directo por ser de bajo riesgo y alcance chico (no
requiere leer esta lista, ya está en el código):
- `orchestrator/main.py`: un `logger.info` deferenciaba `file_a.filename`
  antes del chequeo de "ambos archivos son requeridos", causando un 500
  sin manejar en vez del 400 esperado cuando falta un archivo.
- `app/api/webhooks/processing-result/route.ts`: al completar/fallar una
  submission, ahora limpia explícitamente el campo opuesto (`error` al
  completar, `result_file`/`result_file_size` al fallar) para que no quede
  colgado un valor de un intento anterior.
- `app/login/login-view.tsx` + `app/api/auth/login-password/route.ts`: el
  rate limit devolvía una oración completa como `error` en vez de un
  código corto, y el cliente indexaba `ERROR_COPY[error]` sin validar —
  después de 10 intentos fallidos en 60s la pantalla de login rompía
  (`Cannot read properties of undefined`). Ahora el código es
  `rate_limited` (con su copy) y el cliente cae a un default si el código
  no es reconocido.
- `orchestrator/requirements-dev.txt` (nuevo): pytest no estaba pineado en
  ningún lado; un clone limpio no podía correr la suite siguiendo solo el
  README.

## 1. Race condition en el webhook de cierre (sin locking)

`app/api/webhooks/processing-result/route.ts` hace un
`getFirstListItem` (lee el estado actual) y después un `update()` por
separado, sin transacción ni chequeo optimista de versión. Si dos
callbacks para el mismo `request_id` llegan casi al mismo tiempo mientras
la submission todavía está en `processing` (no es el caso ya cubierto de
duplicado exacto, que si está bien manejado), ambos podrían leer el mismo
estado "no terminal" y escribir, con el segundo pisando el `history` del
primero o duplicando una entrada.

**Por qué importa**: baja probabilidad hoy (un mismo `request_id` no
debería recibir dos callbacks distintos casi simultáneos en el flujo
real), pero si el AI Excel Agent alguna vez reintenta agresivamente su
propio callback antes de que el primero termine de procesarse, podría
pasar.

**Qué propondría**: un chequeo optimista simple -- pasar el `status`
actual leído como precondición al `update()` (PocketBase soporta
filtros en `update` vía `expand`/reglas, pero no un "compare-and-swap"
nativo out of the box; la alternativa más simple es re-leer el registro
justo antes de escribir y abortar con 409 si cambió). No lo implementé
porque cambia el contrato de reintento (¿el orchestrator debe reintentar
ese 409 o no?) y eso lo tiene que decidir quien mantiene el contrato con
el AI Excel Agent.

## 2. `orchestrator_request_id` es opcional en el schema

`pb_migrations/schema_snapshot.json` marca `orchestrator_request_id` como
`required: false`, pero es la ÚNICA clave que el webhook de cierre usa
para encontrar la submission a actualizar (`pb.filter("orchestrator_request_id = {:id}")`).
Si por algún motivo una submission queda creada sin este campo seteado
(hoy se setea en el PATCH que hace el cliente después de la respuesta del
orchestrator, `NewRequestForm.tsx`), el webhook de cierre jamás podrá
encontrarla -- devolverá 404 "unknown request_id" para siempre.

**Por qué importa**: es el latente más peligroso de los dos, porque un
fallo silencioso acá dejaría una solicitud real del usuario colgada en
"processing" para siempre sin ninguna alerta.

**Qué propondría**: marcar el campo `required: true` en el schema (via
migración PocketBase) -- pero esto es una decisión de arquitectura porque
requiere confirmar que NINGÚN flujo existente crea una submission sin
este campo (ver el propio `PATCH` en `NewRequestForm.tsx:155-165`, que
falla en silencio con `.catch(() => {})` si la escritura no llega a
pasar) antes de volverlo obligatorio, para no romper submissions ya en
curso.

## 3. Precedencia HMAC/API-key no documentada (orchestrator)

`webhook_security.py:92-93`: si `AI_AGENT_WEBHOOK_SECRET` está
configurado, el chequeo de `AI_AGENT_INBOUND_API_KEY` nunca se considera,
aunque también esté seteado. Confirmado con tests
(`test_webhook_gaps.py::BothCredentialsConfiguredTests`), pero el plan
(`docs/procesamiento-async-webhook-plan.md` §5) y el docstring del
endpoint no dejan explícito que sea "uno u otro, con HMAC ganando
siempre", no "ambos como alternativas intercambiables".

**Qué propondría**: una línea aclaratoria en el plan/OpenAPI. No cambié
el comportamiento porque no sé si el proveedor real (AI Excel Agent)
espera poder rotar de un esquema a otro sin coordinar -- si es así, la
precedencia actual podría sorprenderlos en un cambio de configuración.

## 4. `ai_agent_job_id` / `processing_started_at` nunca se envían de verdad

El plan (§4.2/§7.1) documenta `ai_agent_job_id` como un campo que el
orchestrator reenvía a Next.js, pero `main.py:530-540` nunca lo pasa a
`forward_result` -- es vestigial. `processing_started_at` se reenvía
siempre como `""` (`main.py:539`, hardcodeado).

**Qué propondría**: decidir si esto se corrige (el orchestrator empieza a
poblar estos campos de verdad) o si se retira de la documentación del
contrato -- hoy el plan describe algo que el código no hace, lo cual
puede confundir a quien lo lea para integrar el proveedor real.

## Nota operativa: datos de test en la PocketBase real

Los tests E2E de Playwright corren contra la PocketBase real de Railway
con una cuenta dedicada (`playwright-e2e@dinardi.com.ar`, ver
`tests/e2e/global-setup.ts`) -- decisión explícita para reusar la infra ya
configurada en vez de levantar una PocketBase local. El orchestrator y el
envío de email SIEMPRE se interceptan (`tests/e2e/fixtures/orchestrator-mock.ts`,
`simulate-webhook-close.ts`), así que ningún test dispara un email real
ni toca el droplet. Un `globalTeardown` borra las submissions de test
después de cada corrida; el usuario de test y su plan elegido quedan
(re-crear el usuario en cada corrida sería más lento y no aporta nada).
