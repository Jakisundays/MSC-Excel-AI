"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";

import { readSheetNames, filterToSelectedSheet } from "@/lib/excel";
import { isValidEmail, invalidEmails } from "@/lib/validators";
import { formatBytes } from "@/lib/format";
import { DEV_PREVIEW } from "@/lib/preview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Phase =
  | "idle"
  | "filtering"
  | "registering"
  | "authorizing"
  | "uploading"
  | "saving"
  | "done"
  | "error";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  filtering: "Filtrando la hoja seleccionada…",
  registering: "Registrando la solicitud…",
  authorizing: "Autorizando la subida…",
  uploading: "Enviando archivos…",
  saving: "Guardando el resultado…",
  done: "",
  error: "",
};

interface OrchestratorResult {
  id?: string;
  attachments?: string[];
  recipient?: string[];
  detail?: string;
}

export function NewRequestForm({ userEmail = "" }: { userEmail?: string }) {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [sheetsA, setSheetsA] = useState<string[]>([]);
  const [sheetsB, setSheetsB] = useState<string[]>([]);
  const [sheetA, setSheetA] = useState("");
  const [sheetB, setSheetB] = useState("");
  const [emails, setEmails] = useState<string[]>(userEmail ? [userEmail] : []);
  const [emailInput, setEmailInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<OrchestratorResult | null>(null);

  const working =
    phase === "filtering" ||
    phase === "registering" ||
    phase === "authorizing" ||
    phase === "uploading" ||
    phase === "saving";

  const ready =
    !!fileA && !!fileB && !!sheetA && !!sheetB && invalidEmails(emails).length === 0;

  async function onPick(slot: "a" | "b", file: File | null) {
    setError("");
    if (slot === "a") {
      setFileA(file);
      setSheetsA([]);
      setSheetA("");
    } else {
      setFileB(file);
      setSheetsB([]);
      setSheetB("");
    }
    if (!file) return;
    try {
      const names = await readSheetNames(file);
      if (names.length === 0) {
        setError(`El archivo ${file.name} no contiene hojas.`);
        return;
      }
      if (slot === "a") {
        setSheetsA(names);
        setSheetA(names[0]);
      } else {
        setSheetsB(names);
        setSheetB(names[0]);
      }
    } catch {
      setError(`No se pudo leer ${file.name}. Puede estar dañado.`);
    }
  }

  function addEmail() {
    const v = emailInput.trim();
    if (!v) return;
    if (!isValidEmail(v)) {
      setError(`Email inválido: ${v}`);
      return;
    }
    if (!emails.includes(v)) setEmails([...emails, v]);
    setEmailInput("");
    setError("");
  }

  async function createPendingSubmission(
    fa: { filename: string },
    fb: { filename: string },
  ): Promise<string> {
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_a_name: fa.filename,
        file_b_name: fb.filename,
        file_a_size: fileA?.size ?? 0,
        file_b_size: fileB?.size ?? 0,
        sheet_a: sheetA,
        sheet_b: sheetB,
        reply_to: emails,
      }),
    });
    if (!res.ok) throw new Error("No se pudo registrar la solicitud.");
    const { id } = await res.json();
    return id as string;
  }

  async function applyDispatchResult(
    id: string,
    status: "processing" | "failed",
    data: OrchestratorResult,
    err: string,
  ) {
    await fetch(`/api/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        orchestrator_request_id: data.id ?? "",
        attachments: data.attachments ?? [],
        error: err,
      }),
    }).catch(() => {});
  }

  async function onSubmit() {
    if (!ready || !fileA || !fileB) return;
    setError("");

    try {
      setPhase("filtering");
      const [fa, fb] = await Promise.all([
        filterToSelectedSheet(fileA, sheetA),
        filterToSelectedSheet(fileB, sheetB),
      ]);

      // Se registra ANTES de llamar al orchestrator: si el navegador se
      // cierra o pierde red durante la subida, la solicitud ya quedó
      // guardada como "pending" en vez de perderse.
      setPhase("registering");
      const submissionId = await createPendingSubmission(fa, fb);

      setPhase("authorizing");
      const tRes = await fetch("/api/upload-ticket", { method: "POST" });
      if (!tRes.ok) throw new Error("No se pudo autorizar la subida. Iniciá sesión de nuevo.");
      const { ticket, orchestratorUrl } = await tRes.json();

      setPhase("uploading");
      let data: OrchestratorResult = {};

      if (DEV_PREVIEW) {
        await new Promise((r) => setTimeout(r, 900));
        data = {
          id: "demo",
          attachments: [fa.filename, fb.filename],
          recipient: [
            "cmatch.ia@witworks.cloud",
            "jacob@dinardi.com.ar",
            "dev@local.test",
          ],
        };
      } else {
        const fd = new FormData();
        fd.append("file_a", fa.blob, fa.filename);
        fd.append("file_b", fb.blob, fb.filename);
        fd.append("sheet_name_a", sheetA);
        fd.append("sheet_name_b", sheetB);
        for (const e of emails) fd.append("to", e);

        const upRes = await fetch(`${orchestratorUrl}/uploadfiles`, {
          method: "POST",
          headers: { Authorization: `Bearer ${ticket}` },
          body: fd,
        });
        try {
          data = await upRes.json();
        } catch {
          /* respuesta sin JSON */
        }
        if (!upRes.ok) {
          await applyDispatchResult(
            submissionId,
            "failed",
            data,
            data.detail ?? `HTTP ${upRes.status}`,
          );
          throw new Error(
            data.detail ?? `El servidor de correo respondió ${upRes.status}.`,
          );
        }
      }

      setPhase("saving");
      await applyDispatchResult(submissionId, "processing", data, "");

      setResult(data);
      setPhase("done");
      toast.success("Solicitud enviada", {
        description: "El equipo recibió tus archivos para procesar.",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setPhase("error");
    }
  }

  function reset() {
    setFileA(null);
    setFileB(null);
    setSheetsA([]);
    setSheetsB([]);
    setSheetA("");
    setSheetB("");
    setEmails(userEmail ? [userEmail] : []);
    setEmailInput("");
    setResult(null);
    setError("");
    setPhase("idle");
  }

  if (phase === "done" && result) {
    return <SuccessPanel result={result} onReset={reset} />;
  }

  const stepsDone = (fileA ? 1 : 0) + (fileB ? 1 : 0) + (emails.length > 0 ? 1 : 0);
  const readyHint = ready
    ? "todo listo para enviar"
    : !fileA
      ? "falta cargar el archivo A"
      : !fileB
        ? "falta cargar el archivo B"
        : "elegí una hoja en cada archivo";

  return (
    <div className="mx-auto w-full max-w-5xl">
      {DEV_PREVIEW && (
        <div className="text-muted-foreground mb-4 flex items-center gap-2 text-xs">
          <span className="bg-chart-3 size-1.5 rounded-full" aria-hidden />
          Modo demo · la subida al orchestrator está simulada
        </div>
      )}

      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive mb-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[1fr_320px] md:items-start">
        {/* FORM */}
        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium">
                1
              </span>
              <h2 className="text-[13.5px] font-medium">Archivos y hojas</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FileSlot
                label="Archivo A"
                file={fileA}
                sheets={sheetsA}
                selected={sheetA}
                onPick={(f) => onPick("a", f)}
                onClear={() => onPick("a", null)}
                onSelect={setSheetA}
                disabled={working}
              />
              <FileSlot
                label="Archivo B"
                file={fileB}
                sheets={sheetsB}
                selected={sheetB}
                onPick={(f) => onPick("b", f)}
                onClear={() => onPick("b", null)}
                onSelect={setSheetB}
                disabled={working}
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium">
                2
              </span>
              <h2 className="text-[13.5px] font-medium">Destinatarios</h2>
              <span className="text-muted-foreground text-xs font-normal">
                (opcional)
              </span>
            </div>
            <div className="bg-card rounded-xl border p-3.5">
              {emails.length > 0 && (
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {emails.map((e) => (
                    <span
                      key={e}
                      className="bg-secondary inline-flex items-center gap-1.5 rounded-full py-1 pr-1 pl-3 font-mono text-xs"
                    >
                      {e}
                      <button
                        type="button"
                        onClick={() => setEmails(emails.filter((x) => x !== e))}
                        disabled={working}
                        className="hover:bg-background/80 text-muted-foreground hover:text-foreground rounded-full p-0.5 transition-colors"
                        aria-label={`Quitar ${e}`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  type="email"
                  inputMode="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                  placeholder="agregar correo y Enter"
                  disabled={working}
                  aria-label="Email para recibir copia"
                  className="border-none bg-transparent px-1 font-mono shadow-none focus-visible:ring-0"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEmail}
                  disabled={working || !emailInput.trim()}
                >
                  Agregar
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* SUMMARY */}
        <div className="bg-card overflow-hidden rounded-2xl border md:sticky md:top-[74px]">
          <div className="flex items-center justify-between border-b px-4 py-3.5">
            <h3 className="text-[13px] font-medium">Resumen de la solicitud</h3>
            <span className="text-muted-foreground font-mono text-[10.5px] tabular-nums">
              {stepsDone}/3
            </span>
          </div>

          <div className="space-y-3 px-4 py-4">
            {[
              { label: "Archivo A", file: fileA, sheet: sheetA },
              { label: "Archivo B", file: fileB, sheet: sheetB },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    f.file
                      ? "bg-success/10 text-success"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <FileSpreadsheet className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-muted-foreground text-[9.5px] font-medium tracking-wider uppercase">
                    {f.label}
                  </div>
                  <div
                    className={cn(
                      "truncate text-[12.5px] font-medium",
                      !f.file && "text-muted-foreground",
                    )}
                  >
                    {f.file ? f.file.name : "Sin cargar"}
                  </div>
                </div>
                {f.sheet && (
                  <span className="text-primary bg-primary/10 shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[10.5px]">
                    {f.sheet}
                  </span>
                )}
              </div>
            ))}

            <div className="flex items-center gap-2.5 py-1 pl-1">
              <span className="bg-border h-6 w-px" aria-hidden />
              <span className="text-muted-foreground bg-muted inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium">
                Procesamiento Excel + IA
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
                <ArrowRight className="size-3.5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-muted-foreground text-[9.5px] font-medium tracking-wider uppercase">
                  Entrega
                </div>
                <div className="text-[12.5px] font-medium">
                  {emails.length}{" "}
                  {emails.length === 1 ? "destinatario" : "destinatarios"}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-muted/40 border-t px-4 py-4">
            <Button
              onClick={onSubmit}
              disabled={!ready || working}
              className="w-full rounded-full"
            >
              {working && <Loader2 className="animate-spin" />}
              {working ? (PHASE_LABEL[phase] || "Enviando…") : "Enviar al equipo"}
            </Button>
            <div className="text-muted-foreground mt-2 text-center text-[10.5px]">
              {readyHint}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileSlot({
  label,
  file,
  sheets,
  selected,
  onPick,
  onClear,
  onSelect,
  disabled,
}: {
  label: string;
  file: File | null;
  sheets: string[];
  selected: string;
  onPick: (f: File | null) => void;
  onClear: () => void;
  onSelect: (s: string) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectId = useId();
  const [drag, setDrag] = useState(false);

  return (
    <div>
      <Label className="mb-2 block">{label}</Label>

      {!file ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            onPick(e.dataTransfer.files?.[0] ?? null);
          }}
          className={cn(
            "flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed text-sm transition-colors duration-200 outline-none",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            drag
              ? "border-ring bg-accent"
              : "hover:bg-accent/60 hover:border-muted-foreground/40",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full">
            <UploadCloud className="size-4" aria-hidden />
          </div>
          <span className="text-muted-foreground mt-1">
            <span className="text-foreground font-medium">Hacé clic</span> o
            arrastrá
          </span>
          <span className="text-muted-foreground text-xs">.xlsx o .xls</span>
        </button>
      ) : (
        <div className="space-y-3 rounded-2xl border p-4">
          <div className="flex items-center gap-3">
            <div className="bg-success/10 text-success flex size-9 shrink-0 items-center justify-center rounded-full">
              <FileSpreadsheet className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{file.name}</div>
              <div className="text-muted-foreground text-xs tabular-nums">
                {formatBytes(file.size)}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClear}
              disabled={disabled}
              aria-label={`Quitar ${label}`}
            >
              <X />
            </Button>
          </div>

          {sheets.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <Label htmlFor={selectId} className="text-muted-foreground text-xs">
                Hoja ({sheets.length} disponibles)
              </Label>
              <Select value={selected} onValueChange={onSelect} disabled={disabled}>
                <SelectTrigger id={selectId} className="w-full">
                  <SelectValue placeholder="Elegí una hoja" />
                </SelectTrigger>
                <SelectContent>
                  {sheets.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        disabled={disabled}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="hidden"
      />
    </div>
  );
}

function SuccessPanel({
  result,
  onReset,
}: {
  result: OrchestratorResult;
  onReset: () => void;
}) {
  return (
    <div className="animate-in fade-in-50 slide-in-from-bottom-2 mx-auto w-full max-w-3xl duration-300">
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col items-center px-6 py-10 text-center">
          <div className="bg-success/10 text-success flex size-12 items-center justify-center rounded-full">
            <CheckCircle2 className="size-6" aria-hidden />
          </div>
          <h2 className="mt-4 text-base font-medium">Solicitud enviada</h2>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm text-pretty">
            Tus archivos están siendo procesados por el equipo de Excel + AI.
            {result.recipient?.length
              ? ` Se enviaron a ${result.recipient.length} destinatarios.`
              : ""}
          </p>

          {result.attachments && result.attachments.length > 0 && (
            <div className="mt-5 w-full max-w-sm space-y-1.5">
              {result.attachments.map((a) => (
                <div
                  key={a}
                  className="bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs"
                >
                  <FileSpreadsheet className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{a}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center gap-2">
            <Button variant="outline" onClick={onReset}>
              <RotateCcw />
              Nueva solicitud
            </Button>
            <Button asChild>
              <Link href="/historial">
                Ver historial
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
