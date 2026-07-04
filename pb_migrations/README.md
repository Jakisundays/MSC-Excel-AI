# Schema de PocketBase — versionado

Hasta el 2026-07-04 el schema real de PocketBase (colecciones `users` y
`submissions`, reglas de acceso, índices) vivía **solo** en la instancia
remota (Railway), sin ninguna copia en git — cualquier cambio hecho a
mano desde el panel de administración era invisible para el equipo y no
pasaba por code review (auditoría técnica 2026-07-03, hallazgo Alto 9).

`schema_snapshot.json` es una exportación de solo lectura del schema real
(`pb.collections.getFullList()`), pensada para:

- **Diffear en PRs**: si alguien cambia una regla de acceso o agrega un
  campo desde el panel, correr `npm run export:pb-schema` de nuevo y el
  diff de git muestra exactamente qué cambió.
- **Reproducir el schema** en una instancia nueva: Panel de PocketBase →
  Settings → Import collections → pegar el contenido de este archivo.

## Regenerar el snapshot

```bash
npm run export:pb-schema
```

Lee `POCKETBASE_URL` / `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD`
de `.env.local` y sobreescribe `schema_snapshot.json`. Commitear el diff
resultante junto con el cambio de schema que lo motivó.

## Estado verificado el 2026-07-04

- `submissions.orchestrator_request_id` tiene índice **único parcial**
  (`WHERE orchestrator_request_id != ''`) — confirma que el lookup del
  webhook de cierre no puede resolver contra un registro equivocado.
- La relación `submissions.user` tiene **`cascadeDelete: true`** —
  confirma que borrar una cuenta borra sus solicitudes (usado por
  `/api/profile/delete`).
- `updateRule` de `submissions` es `user = @request.auth.id` — PocketBase
  ya bloquea que un usuario modifique una solicitud ajena a nivel de API
  rule (la verificación explícita en `app/api/submissions/[id]/route.ts`
  es defensa en profundidad adicional, no el único filtro).
- `deleteRule` es `null` (deshabilitado para usuarios normales), como
  documenta el plan de migración.

Este archivo es un **snapshot**, no una migración ejecutable de
PocketBase (esas requieren el binario/CLI de PocketBase corriendo contra
la instancia, no solo el SDK JS). Si en el futuro se adopta el flujo de
migraciones nativo de PocketBase (`pocketbase migrate collections`),
este snapshot sigue sirviendo como referencia de qué debería contener la
primera migración.
