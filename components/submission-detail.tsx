import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Mail,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { CopyLinkButton } from "@/components/copy-link-button";
import { SubmissionRealtime } from "@/components/submission-realtime";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDateTime } from "@/lib/format";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import type { SubmissionRecord } from "@/lib/pocketbase/types";
import type { SubmissionWithAuthor } from "@/lib/submissions";

function resultFileUrl(submission: SubmissionRecord): string {
  if (!submission.result_file) return "";
  return `${env.POCKETBASE_URL}/api/files/submissions/${submission.id}/${encodeURIComponent(submission.result_file)}`;
}

/** Vacío si esta solicitud no tiene el original guardado (nunca se subió o es anterior a esta feature — ver docs/original-files-storage-plan.md §6). */
function originalFileUrl(
  submission: SubmissionRecord,
  field: "original_file_a" | "original_file_b",
): string {
  const filename = submission[field];
  if (!filename) return "";
  return `${env.POCKETBASE_URL}/api/files/submissions/${submission.id}/${encodeURIComponent(filename)}`;
}

function FileSourceCard({
  label,
  name,
  sheet,
  size,
  downloadUrl,
}: {
  label: string;
  name: string;
  sheet: string;
  size: number;
  downloadUrl?: string;
}) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="bg-success/10 text-success flex size-9 shrink-0 items-center justify-center rounded-full">
          <FileSpreadsheet className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground text-[9.5px] font-medium tracking-wider uppercase">
            {label}
          </div>
          <div className="truncate text-sm font-medium">{name}</div>
        </div>
        {downloadUrl && (
          <Button asChild variant="ghost" size="icon-sm" className="shrink-0">
            <a href={downloadUrl} download={name} aria-label={`Descargar original de ${label}`}>
              <Download />
            </a>
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
        {sheet && (
          <span className="text-primary bg-primary/10 rounded-full px-2.5 py-0.5 font-mono">
            {sheet}
          </span>
        )}
        {size > 0 && (
          <span className="text-muted-foreground font-mono">
            {formatBytes(size)}
          </span>
        )}
      </div>
    </div>
  );
}

function ResultCard({ submission }: { submission: SubmissionRecord }) {
  if (submission.status === "completed") {
    const fileUrl = resultFileUrl(submission);
    return (
      <div className="border-success/30 bg-success/10 rounded-2xl border p-4">
        <div className="flex items-start gap-3">
          <div className="bg-success text-success-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
            <CheckCircle2 className="size-4.5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-success text-[9.5px] font-semibold tracking-wider uppercase">
              Procesamiento completo
            </div>
            <div className="text-sm font-medium">
              {submission.reply_to.length > 0
                ? `Enviado a ${submission.reply_to.length} destinatario${submission.reply_to.length === 1 ? "" : "s"}`
                : "Enviado al equipo"}
            </div>
            {fileUrl && (
              <Button asChild size="sm" className="mt-3 rounded-full">
                <a href={fileUrl} download={submission.result_file}>
                  <Download />
                  Descargar resultado
                  {submission.result_file_size > 0 && (
                    <span className="opacity-70">
                      ({formatBytes(submission.result_file_size)})
                    </span>
                  )}
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (submission.status === "failed") {
    return (
      <div className="border-destructive/30 bg-destructive/10 rounded-2xl border p-4">
        <div className="flex items-start gap-3">
          <div className="bg-destructive flex size-9 shrink-0 items-center justify-center rounded-full text-white">
            <TriangleAlert className="size-4.5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-destructive text-[9.5px] font-semibold tracking-wider uppercase">
              El procesamiento falló
            </div>
            <div className="text-sm font-medium">
              {submission.error || "No se pudo completar el procesamiento."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (submission.status === "processing") {
    return (
      <div className="bg-muted/40 rounded-2xl border border-dashed p-4">
        <div className="flex items-start gap-3">
          <div className="bg-background text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full border">
            <Clock className="size-4.5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground text-[9.5px] font-semibold tracking-wider uppercase">
              En revisión
            </div>
            <div className="text-sm font-medium">
              El equipo de Excel + IA está procesando los archivos.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-muted/40 rounded-2xl border border-dashed p-4">
      <div className="flex items-start gap-3">
        <div className="bg-background text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full border">
          <Clock className="size-4.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground text-[9.5px] font-semibold tracking-wider uppercase">
            Registrada
          </div>
          <div className="text-sm font-medium">
            Solicitud registrada, envío en curso.
          </div>
        </div>
      </div>
    </div>
  );
}

export function SubmissionDetail({
  submission,
}: {
  submission: SubmissionWithAuthor;
}) {
  const authorLabel = submission.authorName || submission.authorEmail;
  const shortId = submission.id.slice(0, 6).toUpperCase();
  const title = `${submission.sheet_a} × ${submission.sheet_b}`;
  const updatedDiffers = submission.updated !== submission.created;

  const timelineSteps: {
    key: string;
    label: string;
    at: string;
    tone: "default" | "success" | "danger";
    note?: string;
  }[] = [{ key: "created", label: "Solicitud creada", at: submission.created, tone: "default" }];

  if (submission.processing_started_at) {
    timelineSteps.push({
      key: "processing",
      label: "Procesamiento iniciado",
      at: submission.processing_started_at,
      tone: "default",
    });
  }

  if (submission.status === "completed" && submission.completed_at) {
    timelineSteps.push({
      key: "completed",
      label: "Procesamiento completo",
      at: submission.completed_at,
      tone: "success",
    });
  } else if (submission.status === "failed") {
    timelineSteps.push({
      key: "failed",
      label: submission.completed_at ? "Procesamiento fallido" : "Envío fallido",
      at: submission.completed_at || submission.updated,
      tone: "danger",
      note: submission.error,
    });
  } else if (updatedDiffers && timelineSteps.length === 1) {
    timelineSteps.push({
      key: "updated",
      label: "Última actualización",
      at: submission.updated,
      tone: "default",
    });
  }

  const isTerminal = submission.status === "completed" || submission.status === "failed";

  return (
    <div className="mx-auto w-full max-w-5xl">
      <SubmissionRealtime submissionId={submission.id} skip={isTerminal} />
      <Link
        href="/historial"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium transition-colors"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Volver al historial
      </Link>

      {authorLabel && (
        <div className="bg-muted text-muted-foreground mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium">
          <Users className="size-3.5" aria-hidden />
          Viendo el proceso de {authorLabel}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <span className="text-muted-foreground font-mono text-[13px] font-medium">
          #{shortId}
        </span>
        <StatusBadge status={submission.status} />
      </div>
      <h1 className="text-xl font-medium tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-1.5 text-[13px]">
        Creada · {formatDateTime(submission.created)}
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="flex flex-col gap-4">
          <div className="bg-card overflow-hidden rounded-2xl border">
            <div className="flex items-center gap-2 border-b px-5 py-3.5">
              <FileSpreadsheet className="text-muted-foreground size-4" aria-hidden />
              <h2 className="text-sm font-medium">Flujo de procesamiento</h2>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <FileSourceCard
                  label="Archivo A"
                  name={submission.file_a_name}
                  sheet={submission.sheet_a}
                  size={submission.file_a_size}
                  downloadUrl={originalFileUrl(submission, "original_file_a")}
                />
                <FileSourceCard
                  label="Archivo B"
                  name={submission.file_b_name}
                  sheet={submission.sheet_b}
                  size={submission.file_b_size}
                  downloadUrl={originalFileUrl(submission, "original_file_b")}
                />
              </div>

              <div className="flex items-center gap-3 py-1">
                <span className="bg-border h-px flex-1" />
                <span className="text-muted-foreground bg-muted inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-medium">
                  <Sparkles className="size-3.5" aria-hidden />
                  Procesamiento Excel + IA
                </span>
                <span className="bg-border h-px flex-1" />
              </div>

              <ResultCard submission={submission} />
            </div>
          </div>

          <div className="bg-card overflow-hidden rounded-2xl border">
            <div className="flex items-center gap-2 border-b px-5 py-3.5">
              <Clock className="text-muted-foreground size-4" aria-hidden />
              <h2 className="text-sm font-medium">Línea de tiempo</h2>
            </div>
            <div className="space-y-4 px-5 py-4">
              {timelineSteps.map((step, i) => (
                <div key={step.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        step.tone === "success" && "bg-success",
                        step.tone === "danger" && "bg-destructive",
                        step.tone === "default" && "bg-primary",
                      )}
                      aria-hidden
                    />
                    {i < timelineSteps.length - 1 && (
                      <span className="bg-border mt-1 w-px flex-1" />
                    )}
                  </div>
                  <div className="pb-1">
                    <div className="text-sm font-medium">{step.label}</div>
                    <div className="text-muted-foreground font-mono text-[11px]">
                      {formatDateTime(step.at)}
                    </div>
                    {step.note && (
                      <div className="text-destructive mt-1 text-xs">{step.note}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-card rounded-2xl border p-5">
            <h3 className="mb-3.5 text-sm font-medium">Estado</h3>
            <StatusBadge status={submission.status} />
            <div className="mt-4 space-y-2 border-t pt-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Creada</span>
                <span className="text-muted-foreground font-mono">
                  {formatDateTime(submission.created)}
                </span>
              </div>
              {updatedDiffers && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Actualizada</span>
                  <span className="text-muted-foreground font-mono">
                    {formatDateTime(submission.updated)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card rounded-2xl border p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="text-sm font-medium">Destinatarios</h3>
              <span className="text-muted-foreground font-mono text-[10.5px]">
                {submission.reply_to.length}
              </span>
            </div>
            {submission.reply_to.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {submission.reply_to.map((addr) => (
                  <div key={addr} className="flex items-center gap-2.5">
                    <div className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full">
                      <Mail className="size-3.5" aria-hidden />
                    </div>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">
                      {addr}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                Sin destinatarios adicionales.
              </p>
            )}
          </div>

          <div className="bg-card overflow-hidden rounded-2xl border p-2">
            <CopyLinkButton />
          </div>
        </div>
      </div>
    </div>
  );
}
