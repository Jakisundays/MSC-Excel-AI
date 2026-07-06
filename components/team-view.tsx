"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Mail, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { CopyLinkButton } from "@/components/copy-link-button";
import type { CompanyMemberView } from "@/lib/company";
import type { InvitationRecord } from "@/lib/pocketbase/types";

type Role = "admin" | "member";

async function postJson(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ocurrió un error inesperado.");
  return data;
}

export function TeamView({
  members,
  invitations,
  viewerRole,
  viewerUserId,
}: {
  members: CompanyMemberView[];
  invitations: InvitationRecord[];
  viewerRole: "owner" | "admin" | "member";
  viewerUserId: string;
}) {
  const router = useRouter();
  const canManage = viewerRole === "owner" || viewerRole === "admin";

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function invite() {
    if (!email.trim()) return;
    setInviting(true);
    try {
      const data = await postJson("/api/invitations", "POST", { email: email.trim(), role });
      toast.success(
        data.emailSent
          ? `Invitación enviada a ${email.trim()}.`
          : `Invitación creada para ${email.trim()}, pero no se pudo enviar el email (SMTP sin configurar) — usá "Copiar link" para pasárselo a mano.`,
      );
      setEmail("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo invitar.");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(memberId: string, newRole: Role) {
    setBusyId(memberId);
    try {
      await postJson("/api/companies/members", "PATCH", { memberId, role: newRole });
      toast.success("Rol actualizado.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el rol.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleStatus(memberId: string, status: "active" | "suspended") {
    setBusyId(memberId);
    try {
      await postJson("/api/companies/members", "PATCH", { memberId, status });
      toast.success(status === "suspended" ? "Miembro suspendido." : "Miembro reactivado.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(memberId: string) {
    setBusyId(memberId);
    try {
      await postJson(`/api/companies/members?memberId=${memberId}`, "DELETE");
      toast.success("Miembro removido de la empresa.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo remover.");
    } finally {
      setBusyId(null);
    }
  }

  async function revokeInvitation(id: string) {
    setBusyId(id);
    try {
      await postJson(`/api/invitations/${id}`, "DELETE");
      toast.success("Invitación revocada.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo revocar.");
    } finally {
      setBusyId(null);
    }
  }

  async function resendInvitation(id: string) {
    setBusyId(id);
    try {
      await postJson(`/api/invitations/${id}`, "PATCH");
      toast.success("Invitación reenviada (nuevo link, 7 días de validez).");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reenviar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-medium tracking-tight">Equipo</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Quién tiene acceso a tu empresa y qué puede hacer cada uno.
        </p>
      </div>

      {canManage && (
        <div className="bg-card flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center">
          <Input
            type="email"
            placeholder="email@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={invite} disabled={inviting || !email.trim()} className="sm:ml-auto">
            {inviting ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Invitar
          </Button>
        </div>
      )}

      {invitations.length > 0 && (
        <div className="bg-card rounded-2xl border">
          <div className="border-b px-4 py-3 text-sm font-medium">Invitaciones pendientes</div>
          <div className="flex flex-col divide-y">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <Mail className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate text-sm">{inv.email}</span>
                <Badge variant="secondary">{inv.role}</Badge>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <CopyLinkButton
                      url={`${typeof window !== "undefined" ? window.location.origin : ""}/invitaciones/aceptar?token=${inv.token}`}
                      label="Copiar link"
                      copiedLabel="Copiado"
                      className="w-auto shrink-0 px-2.5 py-1.5"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === inv.id}
                      onClick={() => resendInvitation(inv.id)}
                    >
                      Reenviar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busyId === inv.id}
                      onClick={() => revokeInvitation(inv.id)}
                    >
                      <X />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Todavía no hay miembros"
          description="Invitá a tu equipo desde el formulario de arriba."
        />
      ) : (
        <div className="bg-card overflow-hidden rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Miembro</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                {canManage && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const isSelf = m.user?.id === viewerUserId;
                const canEditThisRow = canManage && m.role !== "owner" && !isSelf;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{m.user?.name || m.user?.email || "—"}</span>
                        {m.user?.name && (
                          <span className="text-muted-foreground text-xs">{m.user.email}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {canEditThisRow ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) => changeRole(m.id, v as Role)}
                        >
                          <SelectTrigger className="h-8 w-28" disabled={busyId === m.id}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.status === "active" ? "secondary" : "outline"}>
                        {m.status === "active" ? "Activo" : m.status === "suspended" ? "Suspendido" : "Invitado"}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {canEditThisRow && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === m.id}
                              onClick={() =>
                                toggleStatus(m.id, m.status === "active" ? "suspended" : "active")
                              }
                            >
                              {m.status === "active" ? "Suspender" : "Reactivar"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={busyId === m.id}
                              onClick={() => removeMember(m.id)}
                            >
                              Remover
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
