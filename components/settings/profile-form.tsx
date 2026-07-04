"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard } from "@/components/settings/settings-card";
import { initials } from "@/lib/utils";
import type { Session } from "@/lib/auth";

function isoToDateInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function ProfileForm({ session }: { session: Session }) {
  const router = useRouter();

  const [firstName, setFirstName] = useState(session.firstName);
  const [lastName, setLastName] = useState(session.lastName);
  const [phone, setPhone] = useState(session.phone);
  const [city, setCity] = useState(session.city);
  const [birthDate, setBirthDate] = useState(isoToDateInput(session.birthDate));
  const [address, setAddress] = useState(session.address);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);

  const initialName = `${session.firstName} ${session.lastName}`.trim();
  const displayName = `${firstName} ${lastName}`.trim();
  const dirty =
    firstName !== session.firstName ||
    lastName !== session.lastName ||
    phone !== session.phone ||
    city !== session.city ||
    birthDate !== isoToDateInput(session.birthDate) ||
    address !== session.address ||
    !!avatarFile ||
    removeAvatar;

  function pickPhoto() {
    fileInputRef.current?.click();
  }

  function onPhotoSelected(file: File | null) {
    if (!file) return;
    setAvatarFile(file);
    setRemoveAvatar(false);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    setAvatarFile(null);
    setAvatarPreview(null);
    setRemoveAvatar(true);
  }

  function cancel() {
    setFirstName(session.firstName);
    setLastName(session.lastName);
    setPhone(session.phone);
    setCity(session.city);
    setBirthDate(isoToDateInput(session.birthDate));
    setAddress(session.address);
    setAvatarFile(null);
    setAvatarPreview(null);
    setRemoveAvatar(false);
  }

  async function save() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("first_name", firstName);
      fd.append("last_name", lastName);
      fd.append("phone", phone);
      fd.append("city", city);
      fd.append("birth_date", birthDate);
      fd.append("address", address);
      if (removeAvatar) fd.append("remove_avatar", "1");
      if (avatarFile) fd.append("avatar", avatarFile);

      const res = await fetch("/api/profile", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar el perfil.");

      toast.success("Perfil actualizado correctamente");
      setAvatarFile(null);
      setAvatarPreview(null);
      setRemoveAvatar(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  const showAvatar = removeAvatar ? null : avatarPreview || session.avatarUrl;

  return (
    <SettingsCard>
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <Avatar className="size-22">
          {showAvatar && <AvatarImage src={showAvatar} alt={displayName} />}
          <AvatarFallback className="text-2xl">
            {initials(displayName || initialName, session.email)}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="text-base font-medium">Foto de perfil</div>
          <div className="text-muted-foreground mt-1 text-[13px]">
            Usá una imagen cuadrada de al menos 200×200px. JPG, PNG o WEBP.
          </div>
          <div className="mt-3 flex justify-center gap-2.5 sm:justify-start">
            <Button type="button" variant="secondary" size="sm" onClick={pickPhoto}>
              Cambiar foto
            </Button>
            {showAvatar && (
              <Button type="button" variant="ghost" size="sm" onClick={removePhoto}>
                Quitar
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={(e) => onPhotoSelected(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="bg-border h-px" />

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <div>
          <Label htmlFor="p-nombre" className="mb-1.5">
            Nombre
          </Label>
          <Input
            id="p-nombre"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <Label htmlFor="p-apellido" className="mb-1.5">
            Apellido
          </Label>
          <Input
            id="p-apellido"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <Label htmlFor="p-email" className="mb-1.5">
            Correo electrónico
          </Label>
          <Input id="p-email" value={session.email} disabled />
          <p className="text-muted-foreground mt-1.5 text-xs">
            Para cambiar tu correo, escribinos a soporte.
          </p>
        </div>
        <div>
          <Label htmlFor="p-telefono" className="mb-1.5">
            Teléfono
          </Label>
          <Input
            id="p-telefono"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={saving}
            placeholder="+591 700 00000"
          />
        </div>
        <div>
          <Label htmlFor="p-fecha" className="mb-1.5">
            Fecha de nacimiento
          </Label>
          <Input
            id="p-fecha"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <Label htmlFor="p-ciudad" className="mb-1.5">
            Ciudad
          </Label>
          <Input
            id="p-ciudad"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="p-direccion" className="mb-1.5">
          Dirección
        </Label>
        <Input
          id="p-direccion"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={saving}
        />
      </div>

      <div className="bg-border h-px" />

      <div className="flex flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="ghost"
          onClick={cancel}
          disabled={saving || !dirty}
        >
          Cancelar
        </Button>
        <Button type="button" onClick={save} disabled={saving || !dirty}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </SettingsCard>
  );
}
