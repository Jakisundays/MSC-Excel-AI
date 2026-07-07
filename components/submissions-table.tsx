"use client";

import { useRouter } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CompanyMemberView } from "@/lib/company";
import type { SubmissionWithAuthor } from "@/lib/submissions";

function AuthorLabel({
  submission,
  memberStatusById,
}: {
  submission: SubmissionWithAuthor;
  memberStatusById?: Map<string, CompanyMemberView["status"]>;
}) {
  const name = submission.authorName || submission.authorEmail;
  if (!name) return null;
  const isExMember = memberStatusById?.get(submission.user) !== "active";
  return (
    <span className="text-muted-foreground truncate text-xs">
      {name}
      {isExMember && <span className="ml-1 opacity-70">(ex-miembro)</span>}
    </span>
  );
}

/**
 * Tabla de solicitudes responsive: tabla en >=md, cards apiladas en mobile.
 * `bare` omite el contenedor con borde (para anidar dentro de otra card).
 * Cada fila navega al detalle de la solicitud. `showAuthor` agrega la
 * columna "Creado por" (solo tiene sentido en modo "ver equipo").
 */
export function SubmissionsTable({
  items,
  bare = false,
  showAuthor = false,
  memberStatusById,
}: {
  items: SubmissionWithAuthor[];
  bare?: boolean;
  showAuthor?: boolean;
  memberStatusById?: Map<string, CompanyMemberView["status"]>;
}) {
  const router = useRouter();
  const goTo = (id: string) => router.push(`/historial/${id}`);

  return (
    <>
      <div
        className={cn(
          "hidden md:block",
          !bare && "bg-card overflow-hidden rounded-xl border",
        )}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[150px]">Fecha</TableHead>
              <TableHead>Archivos</TableHead>
              <TableHead className="w-[170px]">Hojas</TableHead>
              {showAuthor && <TableHead className="w-[180px]">Creado por</TableHead>}
              <TableHead className="w-[130px]">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((s) => (
              <TableRow
                key={s.id}
                onClick={() => goTo(s.id)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") goTo(s.id);
                }}
                className="hover:bg-muted/50 focus-visible:bg-muted/50 cursor-pointer focus-visible:outline-none"
              >
                <TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
                  {formatDateTime(s.created)}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{s.file_a_name}</div>
                  <div className="text-muted-foreground">{s.file_b_name}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {s.sheet_a} · {s.sheet_b}
                </TableCell>
                {showAuthor && (
                  <TableCell>
                    <AuthorLabel submission={s} memberStatusById={memberStatusById} />
                  </TableCell>
                )}
                <TableCell>
                  <StatusBadge status={s.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {items.map((s) => (
          <div
            key={s.id}
            onClick={() => goTo(s.id)}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") goTo(s.id);
            }}
            className={cn(
              "cursor-pointer px-1 py-3",
              bare
                ? "border-b last:border-0"
                : "bg-card rounded-lg border px-3",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {formatDateTime(s.created)}
              </span>
              <StatusBadge status={s.status} />
            </div>
            <div className="mt-2 text-sm font-medium">{s.file_a_name}</div>
            <div className="text-muted-foreground text-sm">{s.file_b_name}</div>
            <div className="text-muted-foreground mt-1.5 text-xs">
              Hojas: {s.sheet_a} · {s.sheet_b}
            </div>
            {showAuthor && (
              <div className="mt-1">
                <AuthorLabel submission={s} memberStatusById={memberStatusById} />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
