/** Tipos de las colecciones de PocketBase usadas por la app. */

export type SubmissionStatus = "pending" | "processing" | "completed" | "failed";

export interface SubmissionHistoryEntry {
  at: string;
  from: SubmissionStatus | "";
  to: SubmissionStatus;
  note?: string;
}

export interface SubmissionRecord {
  id: string;
  user: string;
  file_a_name: string;
  file_b_name: string;
  file_a_size: number;
  file_b_size: number;
  sheet_a: string;
  sheet_b: string;
  reply_to: string[];
  orchestrator_request_id: string;
  attachments: string[];
  status: SubmissionStatus;
  error: string;
  /** Nombre del archivo de resultado en PocketBase (campo `file`), vacío si no hay. */
  result_file: string;
  result_file_size: number;
  processing_started_at: string;
  completed_at: string;
  ai_agent_job_id: string;
  history: SubmissionHistoryEntry[];
  created: string;
  updated: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  city?: string;
  birth_date?: string;
  address?: string;
  created: string;
  updated: string;
}
