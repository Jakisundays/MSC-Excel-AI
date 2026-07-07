# Plan: conservar los archivos originales (.xlsx/.xls) de cada solicitud

Estado: **implementado** (jul 2026), Opción A (impersonation token,
subida directa navegador → PocketBase). Fases 0-4 completas: migración de
schema aplicada contra PocketBase real, backend, frontend y verificación
e2e contra infraestructura real. Fase 5 (retención/hardening) queda
pendiente, ver §9.

## 1. Diagnóstico de la arquitectura actual

### 1.1 Qué se guarda hoy y qué no

`submissions` (PocketBase) ya tiene metadata de los archivos de entrada
(`file_a_name`, `file_b_name`, `file_a_size`, `file_b_size`, `sheet_a`,
`sheet_b`) y un único campo de tipo `file` real: `result_file` (`maxSize`
20MB, mimeTypes xlsx/xls, `protected: false`).

**Los bytes del archivo original nunca se persisten en ningún lado.** El
flujo real (`components/NewRequestForm.tsx`):

1. El usuario elige `fileA`/`fileB` (los `File` reales del input).
2. `filterToSelectedSheet()` (`lib/excel.ts`) los lee con SheetJS **en el
   navegador** y genera un `Blob` NUEVO que contiene solo la hoja elegida,
   reexportado a `.xlsx` con nombre `${base}_seleccionado.xlsx`. Este blob
   ya no es un original — es una copia filtrada de una sola hoja.
3. `POST /api/submissions` crea el registro `pending` con metadata (nombre
   del blob filtrado, tamaño del `File` original — ver 1.3, es una
   inconsistencia existente).
4. `POST /api/upload-ticket` firma un JWT propio de corta duración
   (`lib/ticket.ts`, no es un token de PocketBase) para autorizar la subida.
5. El navegador sube el **blob filtrado** directo a
   `${ORCHESTRATOR_URL}/uploadfiles` (un droplet externo, fuera de este
   repo) — nunca pasa por nuestro backend Next.js.
6. El orchestrator procesa y, cuando termina, llama a
   `POST /api/webhooks/processing-result` (server-to-server, HMAC, admin
   PocketBase) que escribe `result_file` + `status` final.

Es decir: ni siquiera el blob filtrado llega a nuestra infraestructura hoy
— solo su nombre/tamaño quedan registrados. El `File` original elegido por
el usuario vive solo en memoria del tab y se descarta al resetear el
formulario.

### 1.2 La restricción que dictó este diseño

`next.config.ts` y `README.md` son explícitos: la app corre en **Vercel**,
que impone un límite duro de **~4.5MB por request** a cualquier Serverless/
Route Handler. Por eso el envío al orchestrator se hace **directo
navegador → droplet**, evitando que los archivos pesados pasen por Vercel.
Esta es la restricción central que condiciona cualquier solución para
guardar el original: si lo mandamos a través de una ruta de Next.js,
heredamos el mismo límite de ~4.5MB.

(Dato aparte, no bloqueante para este plan: el webhook de cierre sí recibe
`result_file` de hasta 20MB vía una ruta Next.js — en la práctica probablemente
los resultados reales están muy por debajo del límite, pero es un punto a
verificar, no algo que este plan deba resolver.)

### 1.3 Bug menor que conviene corregir junto con esta feature

`createPendingSubmission()` (`components/NewRequestForm.tsx:127-147`) guarda:
- `file_a_name`/`file_b_name` = nombre del **blob filtrado** (`fa.filename`,
  con sufijo `_seleccionado.xlsx`), no el nombre real del archivo subido.
- `file_a_size`/`file_b_size` = tamaño del **`File` original** (`fileA.size`).

Hoy son dos campos que describen dos objetos distintos. Si vamos a
conservar el original de verdad, tiene sentido alinear ambos al mismo
referente (el original) — cambio de una línea, mencionado en la Fase 2.

## 2. Decisión de diseño: cómo transportar el original hasta el storage

Esta es la decisión central del plan. Tres opciones, con recomendación.

### Opción A (recomendada): subida directa navegador → PocketBase, con token de impersonación de corta vida

Igual que ya se hace con el orchestrator: el navegador sube el archivo
**directo** a PocketBase (bypasseando Vercel por completo), autorizado por
una credencial de corta duración emitida por nuestro backend.

Diferencia clave respecto al patrón del orchestrator: PocketBase no entiende
el JWT propio de `lib/ticket.ts` — necesita un token de PocketBase real para
que `submissions.updateRule` (`user = @request.auth.id`) se evalúe. El
`authToken` de sesión normal dura **5 días** (`authToken.duration: 432000`
en el schema) — exponerlo al JS del cliente, aunque sea un instante, es un
riesgo real (robo de sesión de 5 días, no de un solo request).

Mitigación: PocketBase permite a un **superusuario** emitir un token de
**impersonation** con duración corta y arbitraria
(`pb.collection('users').impersonate(userId, duration)` en el SDK JS),
conservando la identidad y las reglas del usuario impersonado (no eleva
privilegios). Nuestro backend ya tiene un cliente admin (`getAdminPb()`,
usado hoy por el webhook) — puede emitir un token de ~60-120s, de un solo
uso efectivo, y devolverlo al navegador junto con la URL de PocketBase.

Flujo propuesto:
- Extender `POST /api/upload-ticket` (o agregar un endpoint hermano) para
  que, tras las mismas validaciones que ya hace (sesión + subscription
  gate), también devuelva `{ pbUploadToken, pocketbaseUrl }` vía
  `getAdminPb().collection('users').impersonate(record.id, 120)`.
- El navegador hace un `PATCH` multipart directo a
  `${pocketbaseUrl}/api/collections/submissions/records/{id}` con
  `Authorization: Bearer <pbUploadToken>` y los campos `original_file_a`/
  `original_file_b`.
- El token expira solo; nunca se persiste en el cliente (variable en
  memoria del tab, se descarta tras el fetch).

Ventajas: cero cambios al modelo de auth existente (el token expuesto vive
segundos, no días), sin límite de Vercel, sin tocar el orchestrator (fuera
de este repo), reutiliza exactamente el patrón "ticket de corta vida" que
el equipo ya validó y aceptó para el caso del orchestrator.

Riesgo a validar en Fase 0: confirmar que `impersonate()` está disponible
en la versión de PocketBase del proyecto (SDK `pocketbase@0.26.0` — la
funcionalidad de impersonation es relativamente reciente en PocketBase;
probar contra una instancia de dev antes de comprometerse a esta opción).

### Opción B (fallback simple): proxy a través de Next.js, acotado a ~4MB

Reusar `PATCH /api/submissions/[id]` (o una ruta hermana) para aceptar
multipart y escribirlo con la sesión del propio usuario (mismo patrón que
ya usa esa ruta, cero superficie de seguridad nueva). Requiere aceptar que
archivos por encima de ~4MB no se pueden guardar por esta vía (Vercel
corta antes de que lleguen a nuestro código) — degradación silenciosa
aceptable solo si la mayoría de los originales reales son chicos (a medir
en Fase 0 contra `file_a_size`/`file_b_size` históricos).

Más simple y con menos piezas nuevas, pero introduce un límite de producto
(no técnico) que puede sorprender a usuarios con archivos grandes —
justamente el tipo de archivo que más valor tiene conservar (pólizas,
siniestros, carteras completas sin filtrar).

### Opción C (no recomendada para este alcance): el orchestrator reenvía los originales

El orchestrator ya recibe los archivos completos — podría reenviarlos a un
webhook nuevo (mismo patrón que `processing-result`, admin creds,
server-to-server, sin límite de Vercel porque nunca pasa por el navegador
de vuelta). Técnicamente la más limpia, pero requiere modificar un servicio
que **no vive en este repo** (el droplet del orchestrator), agregando una
dependencia cruzada de despliegue que las otras dos opciones evitan. Se
menciona por completitud; no se recomienda como primera vía.

**Recomendación: Opción A**, con Opción B documentada como fallback si en
Fase 0 se descubre que `impersonate()` no está disponible o introduce
complejidad no anticipada.

## 3. Modelo de datos

Agregar a la colección `submissions` (vía script de migración, ver §6,
mismo patrón que `scripts/pb-migrations/001-b2b-schema.mjs` /
`002-historial-equipo.mjs`):

```js
{ name: "original_file_a", type: "file", maxSelect: 1, maxSize: 26214400 /* 25MB */,
  mimeTypes: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
  protected: false, thumbs: null, required: false }
{ name: "original_file_b", /* idéntico */ }
```

Notas de diseño:
- **No hacen falta campos de metadata nuevos.** `file_a_name`/`file_a_size`
  (y su par B) ya existen; una vez corregido el bug de §1.3, describen
  exactamente el archivo que estos nuevos campos van a contener. Evita
  duplicar información y mantiene una sola fuente de verdad por par
  (nombre/tamaño en texto+number, bytes en el campo `file`).
- `maxSize` 25MB (más generoso que `result_file`, 20MB) porque el original
  sin filtrar — con formato, fórmulas, múltiples hojas — suele pesar más
  que el resultado de una sola hoja. Ajustar tras medir tamaños reales
  (Fase 0).
- `protected: false`, igual que `result_file` hoy: mismo modelo de
  confianza ya aceptado (URL no listada, solo se expone desde una página
  que ya validó ownership). No es una regresión de este cambio; ver §5.
- No se toca `createRule`/`updateRule` de `submissions` — `updateRule`
  (`user = @request.auth.id`) ya cubre exactamente este caso de uso.

## 4. Cambios de backend, frontend y modelo (resumen accionable)

**Backend**
- Script `scripts/pb-migrations/003-original-files.mjs` (idempotente,
  mismo helper `ensureFieldsAndRules` que ya existe en `001-b2b-schema.mjs`)
  agrega los dos campos.
- Correr contra la instancia real, `npm run export:pb-schema`, commitear
  el diff de `pb_migrations/schema_snapshot.json`.
- `POST /api/upload-ticket` (`app/api/upload-ticket/route.ts`): además del
  ticket del orchestrator, emitir `pbUploadToken` vía
  `getAdminPb().collection('users').impersonate(record.id, 120)` y devolver
  también `pocketbaseUrl: env.POCKETBASE_URL`. Mismo gate de suscripción que
  ya corre ahí — sin lógica nueva de autorización.
- `lib/pocketbase/types.ts`: agregar `original_file_a: string` y
  `original_file_b: string` a `SubmissionRecord` (mismo patrón que
  `result_file: string`, string vacío = ausente).

**Frontend**
- `components/NewRequestForm.tsx`:
  - Corregir `createPendingSubmission` para mandar `fileA.name`/`fileB.name`
    (no `fa.filename`/`fb.filename`) — alinea metadata con el original real.
  - Tras obtener `pbUploadToken`/`pocketbaseUrl` de `/api/upload-ticket`,
    disparar la subida de `fileA`/`fileB` (los `File` originales, **no**
    `fa.blob`/`fb.blob`) directo a PocketBase, en paralelo con la subida al
    orchestrator (`Promise.allSettled`, nunca bloqueante — ver §5,
    rendimiento).
  - Envolver en try/catch silencioso: un fallo al guardar el original
    JAMÁS debe impedir ni marcar como fallida la solicitud principal (ya
    procesada por el orchestrator). Mismo criterio "fire and forget" que
    ya usa `applyDispatchResult(...).catch(() => {})`.
- `components/submission-detail.tsx`: agregar `originalFileUrl(submission, "a"|"b")`
  (mismo patrón que `resultFileUrl`) y un botón/ícono de descarga dentro de
  `FileSourceCard`, condicionado a que el campo no esté vacío.
- `lib/submissions.ts`: agregar `original_file_a`/`original_file_b` a los
  registros `MOCK` (algunos con valor, algunos vacíos, para poder probar
  ambos estados en `DEV_PREVIEW` sin PocketBase real).

## 5. Asociación entre archivo original y archivo de resultado

No hace falta ninguna relación nueva: **ambos son campos del mismo
registro `submissions`**, igual que `result_file` ya convive con
`file_a_name`/`file_b_name` en la misma fila. La asociación es el propio
`id` de la solicitud — es el mismo modelo que ya usa la app, no una
solución paralela. `getSubmission()`/`searchSubmissions()`
(`lib/submissions.ts`) no necesitan cambios de lógica, solo devuelven los
campos nuevos como parte del mismo record.

## 6. Migración de solicitudes existentes

- Los campos nuevos son **opcionales** (`required: false`), igual que
  `result_file` ya lo es hoy. Las filas viejas simplemente quedan con
  `original_file_a`/`original_file_b` vacíos — no requiere backfill de
  schema.
- **No hay backfill de datos posible**: los bytes del original nunca se
  guardaron en ningún sistema (ni siquiera transitoriamente en el
  orchestrator, que solo ve el blob ya filtrado a una hoja). Es una
  limitación de hecho, no de implementación — debe comunicarse así al
  pedir el sign-off del plan.
- El frontend debe tratar "sin original" como estado válido y esperado
  para todo lo creado antes de este cambio: `FileSourceCard` muestra
  nombre/hoja/tamaño igual que hoy, y solo agrega el botón de descarga
  cuando el campo viene poblado (mismo patrón defensivo que
  `resultFileUrl()` ya usa para `result_file`).
- No hace falta migrar `attachments` (json, son nombres que devuelve el
  orchestrator, no archivos) ni tocar `deleteRule`/`cascadeDelete`.

## 7. Seguridad, permisos y rendimiento

**Seguridad**
- El token de impersonación vive en el servidor hasta el momento de
  responder al cliente, dura ~60-120s, y hereda las reglas del usuario
  real (`updateRule: user = @request.auth.id`) — un intercepto no da
  acceso a nada fuera de la propia solicitud del usuario, y expira casi
  de inmediato (vs. los 5 días del `authToken` de sesión normal).
- Reusar el chequeo de ownership que ya existe en
  `PATCH /api/submissions/[id]:38-41` antes de emitir cualquier ticket.
- MIME/extensión validados en dos capas, igual que hoy: `accept=".xlsx,.xls"`
  en el input (UX) + `mimeTypes` del campo PocketBase (autoritativo).
- Tamaño máximo validado client-side (fail-fast, buena UX) y por
  `maxSize` de PocketBase (autoritativo).
- Abuso/costo de subir archivos grandes repetidamente: ya está acotado por
  el subscription gate existente (`evaluateSubscriptionGate` en
  `/api/upload-ticket`) — no hace falta un mecanismo nuevo, el ticket de
  impersonación solo se emite si ese gate ya dejó pasar al usuario.
- `protected: false` en los nuevos campos replica el modelo de confianza
  de `result_file` (URL no listada, solo se entrega desde una página que
  ya verificó ownership/company). No es una regresión introducida por
  este cambio, pero como ahora hay **tres** archivos por solicitud en vez
  de uno, es un buen momento para anotar como mejora futura (no
  bloqueante): migrar los tres a `protected: true` + tokens de archivo de
  PocketBase (`pb.files.getUrl(record, filename, { token })`).
- **Retención de datos**: hoy el diseño evita persistir el original por
  completo. Guardar de forma indefinida los archivos crudos que suben los
  usuarios (que, a juzgar por los ejemplos en `lib/submissions.ts`,
  incluyen datos de pólizas/siniestros — potencialmente sensibles) es un
  cambio de postura de privacidad/compliance, no solo técnico. Antes de
  implementar, confirmar con quien corresponda si existe una política de
  retención que deba aplicarse (ej. borrar originales a los N días vía un
  cron, mismo patrón que ya existe en `app/api/cron/mark-stale`). No es
  parte del alcance mínimo, pero debe quedar decidido explícitamente y no
  por omisión.

**Rendimiento**
- La subida del original debe correr **en paralelo** con la subida al
  orchestrator (`Promise.allSettled`), no en serie — evita duplicar el
  tiempo total de envío percibido por el usuario.
- Subir directo navegador → PocketBase (Opción A) no agrega carga a
  Vercel/Next.js (los bytes nunca pasan por una function) — mejor que la
  Opción B en este eje también.
- Almacenamiento: cada solicitud pasa de guardar ~1 archivo a ~3 (dos
  originales + resultado) — crecimiento de uso de disco en la instancia de
  PocketBase que vale la pena monitorear post-rollout, y que motiva
  considerar la política de retención del punto anterior.
- Las descargas siguen sirviéndose directo desde PocketBase (como
  `result_file` hoy) — no agregan carga al backend Next.js.

## 8. Estrategia de fases

**Fase 0 — Validación (sin código)**
- Medir p50/p95/p99 de `file_a_size`/`file_b_size` históricos en
  PocketBase para dimensionar `maxSize` con datos reales, no una
  suposición.
- Confirmar en un entorno de prueba que
  `pb.collection('users').impersonate(id, duration)` funciona con la
  versión de PocketBase del proyecto — condición para comprometerse a la
  Opción A en vez de caer a la Opción B.
- Confirmar si existe requisito de retención/compliance sobre estos
  archivos (§7).
- Salida: Opción A o B confirmada, `maxSize` definitivo.

**Fase 1 — Schema + backend (sin cambios visibles para el usuario)**
- Migración `003-original-files.mjs`, correr, exportar snapshot, commitear.
- Extender `/api/upload-ticket` con el token de impersonación.
- Actualizar `SubmissionRecord` y `MOCK`.
- Tests de integración del nuevo endpoint (convención de
  `tests/integration/webhook-processing-result.test.ts`).

**Fase 2 — Frontend: subida (happy path)**
- `NewRequestForm.tsx`: capturar y subir los `File` originales en paralelo
  al envío al orchestrator, best-effort, sin bloquear el flujo principal.
- Corregir el bug de nombre de §1.3 en el mismo cambio.

**Fase 3 — Visualización y descarga**
- `submission-detail.tsx`: botones de descarga de los originales,
  condicionados a que el campo exista (retrocompatible con solicitudes
  viejas por diseño, §6).

**Fase 4 — QA y rollout**
- Probar: archivo cerca del `maxSize`, `.xls` legado, red lenta/cortada a
  mitad de subida (el submit principal no debe verse afectado), doble
  envío accidental.
- Extender `tests/e2e/submission-flow.spec.ts`.
- Monitorear crecimiento de storage en PocketBase la primera semana.

**Fase 5 — Opcional / futuro**
- Política de retención (cron de limpieza) si Fase 0 determinó que hace
  falta.
- Evaluar `protected: true` + file tokens para los tres campos de archivo
  de `submissions`.

## 9. Preguntas abiertas para confirmar antes de implementar

1. ¿Hay una política de retención de datos de clientes que deba limitar
   cuánto tiempo se guardan estos archivos?
2. ¿La versión de PocketBase en uso soporta `impersonate()` con duración
   corta? (bloqueante para la Opción A)
3. ¿Vale la pena mostrar también un indicador de "adjuntos disponibles"
   en la tabla de historial, o alcanza con el detalle (como pide el
   alcance original)?
