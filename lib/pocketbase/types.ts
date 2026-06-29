/** Tipos de las colecciones de PocketBase usadas por la app. */

export type SubmissionStatus = "pending" | "sent" | "failed";

export interface SubmissionRecord {
  id: string;
  user: string;
  file_a_name: string;
  file_b_name: string;
  sheet_a: string;
  sheet_b: string;
  reply_to: string[];
  orchestrator_request_id: string;
  attachments: string[];
  status: SubmissionStatus;
  error: string;
  created: string;
  updated: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
}
