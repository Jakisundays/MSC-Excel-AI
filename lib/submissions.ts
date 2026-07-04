import "server-only";

import { getServerPb } from "@/lib/pocketbase/server";
import { DEV_PREVIEW } from "@/lib/preview";
import type { SubmissionRecord } from "@/lib/pocketbase/types";

const MOCK: SubmissionRecord[] = [
  {
    id: "m1",
    user: "dev-user",
    file_a_name: "cartera_marzo.xlsx",
    file_b_name: "siniestros_q1.xlsx",
    file_a_size: 254_318,
    file_b_size: 512_940,
    sheet_a: "Resumen",
    sheet_b: "Detalle",
    reply_to: ["analista@dinardi.com.ar"],
    orchestrator_request_id: "abc123",
    attachments: ["doc_a_cartera_marzo.xlsx", "doc_b_siniestros_q1.xlsx"],
    status: "completed",
    error: "",
    result_file: "resultado_cartera_marzo.xlsx",
    result_file_size: 331_442,
    processing_started_at: "2026-06-28T14:30:30Z",
    completed_at: "2026-06-28T14:52:10Z",
    ai_agent_job_id: "job-abc123",
    history: [],
    created: "2026-06-28T14:30:00Z",
    updated: "2026-06-28T14:52:10Z",
  },
  {
    id: "m2",
    user: "dev-user",
    file_a_name: "polizas_abril.xlsx",
    file_b_name: "comparativa.xlsx",
    file_a_size: 98_304,
    file_b_size: 143_872,
    sheet_a: "Hoja1",
    sheet_b: "Vigentes",
    reply_to: [],
    orchestrator_request_id: "def456",
    attachments: ["doc_a_polizas_abril.xlsx", "doc_b_comparativa.xlsx"],
    status: "processing",
    error: "",
    result_file: "",
    result_file_size: 0,
    processing_started_at: "2026-06-27T09:15:20Z",
    completed_at: "",
    ai_agent_job_id: "",
    history: [],
    created: "2026-06-27T09:15:00Z",
    updated: "2026-06-27T09:15:20Z",
  },
  {
    id: "m3",
    user: "dev-user",
    file_a_name: "datos_mayo.xls",
    file_b_name: "base.xlsx",
    file_a_size: 621_005,
    file_b_size: 88_211,
    sheet_a: "Datos",
    sheet_b: "Maestro",
    reply_to: ["ops@witworks.cloud"],
    orchestrator_request_id: "",
    attachments: [],
    status: "failed",
    error: "SMTP timeout",
    result_file: "",
    result_file_size: 0,
    processing_started_at: "",
    completed_at: "",
    ai_agent_job_id: "",
    history: [],
    created: "2026-06-26T17:42:00Z",
    updated: "2026-06-26T18:03:00Z",
  },
];

export async function listSubmissions(
  userId: string,
): Promise<{ items: SubmissionRecord[]; error: boolean }> {
  if (DEV_PREVIEW) return { items: MOCK, error: false };

  try {
    const res = await getServerPb().then((pb) =>
      pb.collection("submissions").getList(1, 200, {
        sort: "-created",
        filter: `user = "${userId}"`,
      }),
    );
    return { items: res.items as unknown as SubmissionRecord[], error: false };
  } catch {
    return { items: [], error: true };
  }
}

/** Una solicitud puntual (para Detalle). Verifica ownership además de la regla de PocketBase. */
export async function getSubmission(
  userId: string,
  id: string,
): Promise<SubmissionRecord | null> {
  if (DEV_PREVIEW) return MOCK.find((m) => m.id === id) ?? null;

  try {
    const rec = await getServerPb().then((pb) =>
      pb.collection("submissions").getOne(id),
    );
    const submission = rec as unknown as SubmissionRecord;
    if (submission.user !== userId) return null;
    return submission;
  } catch {
    return null;
  }
}

export async function countSubmissions(userId: string): Promise<number> {
  if (DEV_PREVIEW) return MOCK.length;

  try {
    const res = await getServerPb().then((pb) =>
      pb.collection("submissions").getList(1, 1, {
        filter: `user = "${userId}"`,
      }),
    );
    return res.totalItems;
  } catch {
    return 0;
  }
}
