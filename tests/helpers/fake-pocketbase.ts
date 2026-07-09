import { ClientResponseError } from "pocketbase";
import type { SubmissionRecord } from "@/lib/pocketbase/types";

/**
 * Doble de PocketBase para tests de integración de rutas server-to-server
 * (webhook de cierre, upload-ticket). No reimplementa el SDK real: solo
 * el subconjunto que las rutas bajo test realmente usan
 * (collection().getFirstListItem/update, .filter()). Usa la clase real
 * ClientResponseError (del paquete "pocketbase", no mockeado) para que
 * los `instanceof ClientResponseError` de las rutas sigan funcionando.
 */
export function makeFakeAdminPb(
  opts: {
    /** Submissions existentes, indexadas por su `id` de PocketBase (NO por
     * orchestrator_request_id -- la búsqueda real es por ese campo, ver
     * getFirstListItem más abajo, mientras que update() siempre recibe el
     * `id` del record). */
    submissions?: SubmissionRecord[];
    lookupError?: unknown;
    updateError?: unknown;
  } = {},
) {
  const store = new Map<string, SubmissionRecord>();
  for (const sub of opts.submissions ?? []) {
    store.set(sub.id, sub);
  }
  const updateCalls: Array<{ id: string; payload: Record<string, unknown> }> = [];

  const pb = {
    filter(_expr: string, params: Record<string, unknown>) {
      // No interpreta la expresión real de PocketBase -- alcanza con
      // preservar los params para que getFirstListItem busque por ellos.
      return JSON.stringify(params);
    },
    collection(name: string) {
      if (name !== "submissions") {
        throw new Error(`fake pb: colección no soportada: ${name}`);
      }
      return {
        async getFirstListItem(filterStr: string): Promise<SubmissionRecord> {
          if (opts.lookupError) throw opts.lookupError;
          const { id: requestId } = JSON.parse(filterStr) as { id: string };
          const found = [...store.values()].find(
            (s) => s.orchestrator_request_id === requestId,
          );
          if (!found) {
            throw new ClientResponseError({
              status: 404,
              response: { message: "not found" },
            });
          }
          return found;
        },
        // Usado por la ruta para el "re-chequeo pegado a la escritura"
        // (relee por `id` justo antes de escribir, ver comentario en
        // app/api/webhooks/processing-result/route.ts). Reusa la misma
        // `store` que getFirstListItem/update para que la relectura vea
        // el mismo estado.
        async getOne(id: string): Promise<SubmissionRecord> {
          const found = store.get(id);
          if (!found) {
            throw new ClientResponseError({
              status: 404,
              response: { message: "not found" },
            });
          }
          return found;
        },
        async update(id: string, payload: Record<string, unknown>) {
          updateCalls.push({ id, payload });
          if (opts.updateError) throw opts.updateError;
          const merged = {
            ...(store.get(id) as object),
            ...payload,
          } as unknown as SubmissionRecord;
          store.set(id, merged);
          return merged;
        },
      };
    },
  };

  return { pb, store, updateCalls };
}

/** Fixture base de una submission "processing", lista para completar/fallar. */
export function baseSubmission(
  overrides: Partial<SubmissionRecord> = {},
): SubmissionRecord {
  return {
    id: "sub-1",
    user: "user-1",
    file_a_name: "a.xlsx",
    file_b_name: "b.xlsx",
    file_a_size: 100,
    file_b_size: 100,
    sheet_a: "HojaA",
    sheet_b: "HojaB",
    reply_to: [],
    orchestrator_request_id: "req-1",
    attachments: [],
    status: "processing",
    error: "",
    result_file: "",
    result_file_size: 0,
    result_file_name: "",
    original_file_a: "",
    original_file_b: "",
    processing_started_at: "",
    completed_at: "",
    ai_agent_job_id: "",
    history: [],
    created: "2026-07-01T00:00:00.000Z",
    updated: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}
