"use client";

import { useState } from "react";
import { readSheetNames, filterToSelectedSheet } from "@/lib/excel";
import { isValidEmail, invalidEmails } from "@/lib/validators";

type Status = "idle" | "working" | "done" | "error";

interface OrchestratorResult {
  id?: string;
  attachments?: string[];
  recipient?: string[];
  detail?: string;
}

export function NewRequestForm() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [sheetsA, setSheetsA] = useState<string[]>([]);
  const [sheetsB, setSheetsB] = useState<string[]>([]);
  const [sheetA, setSheetA] = useState("");
  const [sheetB, setSheetB] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<OrchestratorResult | null>(null);

  async function onPick(slot: "a" | "b", file: File | null) {
    setError("");
    setResult(null);
    setStatus("idle");
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
    } catch (e) {
      setError(`No se pudo leer ${file.name}. Puede estar corrupto.`);
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

  function removeEmail(e: string) {
    setEmails(emails.filter((x) => x !== e));
  }

  const ready =
    !!fileA &&
    !!fileB &&
    !!sheetA &&
    !!sheetB &&
    invalidEmails(emails).length === 0;

  async function onSubmit() {
    if (!ready || !fileA || !fileB) return;
    setStatus("working");
    setError("");
    setResult(null);

    try {
      // 1. Filtrar a la hoja elegida (cliente, SheetJS)
      const [fa, fb] = await Promise.all([
        filterToSelectedSheet(fileA, sheetA),
        filterToSelectedSheet(fileB, sheetB),
      ]);

      // 2. Pedir el upload-ticket a Next.js (valida sesión)
      const tRes = await fetch("/api/upload-ticket", { method: "POST" });
      if (!tRes.ok) {
        throw new Error("No se pudo autorizar la subida. Reiniciá sesión.");
      }
      const { ticket, orchestratorUrl } = await tRes.json();

      // 3. Subir DIRECTO al orchestrator (no pasa por Vercel)
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

      let data: OrchestratorResult = {};
      try {
        data = await upRes.json();
      } catch {
        /* respuesta sin JSON */
      }

      // 4. Registrar la solicitud en PocketBase (sent/failed)
      await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_a_name: fileA.name,
          file_b_name: fileB.name,
          sheet_a: sheetA,
          sheet_b: sheetB,
          reply_to: emails,
          orchestrator_request_id: data.id ?? "",
          attachments: data.attachments ?? [],
          status: upRes.ok ? "sent" : "failed",
          error: upRes.ok ? "" : data.detail ?? `HTTP ${upRes.status}`,
        }),
      }).catch(() => {});

      if (!upRes.ok) {
        throw new Error(
          data.detail ?? `El servidor de correo respondió ${upRes.status}.`,
        );
      }

      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setStatus("error");
    }
  }

  const working = status === "working";

  return (
    <div className="max-w-2xl">
      {status === "done" && result && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="text-sm font-medium text-green-800">
            Solicitud enviada correctamente
          </div>
          <p className="mt-1 text-sm text-green-700">
            Tus archivos están siendo procesados por el equipo de Excel + AI.
            {result.recipient?.length
              ? ` Se enviaron a: ${result.recipient.join(", ")}.`
              : ""}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Paso 1: archivos + hojas */}
      <section className="rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h2 className="text-sm font-semibold">1. Archivos y hojas</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <FileSlot
            label="Archivo A"
            file={fileA}
            sheets={sheetsA}
            selected={sheetA}
            onPick={(f) => onPick("a", f)}
            onSelect={setSheetA}
            disabled={working}
          />
          <FileSlot
            label="Archivo B"
            file={fileB}
            sheets={sheetsB}
            selected={sheetB}
            onPick={(f) => onPick("b", f)}
            onSelect={setSheetB}
            disabled={working}
          />
        </div>
      </section>

      {/* Paso 2: emails reply-to */}
      <section className="mt-4 rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h2 className="text-sm font-semibold">2. Emails para recibir copia</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Opcional. Se agregan como Reply-To de la solicitud.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEmail();
              }
            }}
            placeholder="nombre@empresa.com"
            disabled={working}
            className="flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={addEmail}
            disabled={working}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm transition hover:bg-[var(--color-surface)]"
          >
            Agregar
          </button>
        </div>
        {emails.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {emails.map((e) => (
              <span
                key={e}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface)] px-3 py-1 text-xs"
              >
                {e}
                <button
                  type="button"
                  onClick={() => removeEmail(e)}
                  className="text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                  aria-label={`Quitar ${e}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Paso 3: enviar */}
      <div className="mt-6">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!ready || working}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {working ? "Enviando…" : "Enviar solicitud"}
        </button>
        {!ready && !working && (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Cargá ambos archivos y elegí una hoja por cada uno para habilitar el
            envío.
          </p>
        )}
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
  onSelect,
  disabled,
}: {
  label: string;
  file: File | null;
  sheets: string[];
  selected: string;
  onPick: (f: File | null) => void;
  onSelect: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        type="file"
        accept=".xlsx,.xls"
        disabled={disabled}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="mt-2 block w-full text-sm text-[var(--color-muted)] file:mr-3 file:rounded-md file:border file:border-[var(--color-border)] file:bg-white file:px-3 file:py-1.5 file:text-sm hover:file:bg-[var(--color-surface)]"
      />
      {file && sheets.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-[var(--color-muted)]">
            Hoja ({sheets.length} disponibles)
          </div>
          <select
            value={selected}
            disabled={disabled}
            onChange={(e) => onSelect(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          >
            {sheets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
