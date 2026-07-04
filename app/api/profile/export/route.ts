import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { listSubmissions } from "@/lib/submissions";

/** Exporta el perfil y el historial de solicitudes del usuario autenticado como JSON descargable. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { items } = await listSubmissions(session.id);

  const payload = {
    exportado: new Date().toISOString(),
    perfil: {
      id: session.id,
      email: session.email,
      nombre: session.firstName,
      apellido: session.lastName,
      telefono: session.phone,
      ciudad: session.city,
      fechaNacimiento: session.birthDate,
      direccion: session.address,
      cuentaCreada: session.created,
      ultimaActualizacion: session.updated,
    },
    solicitudes: items.map((s) => ({
      id: s.id,
      archivoA: s.file_a_name,
      archivoB: s.file_b_name,
      hojaA: s.sheet_a,
      hojaB: s.sheet_b,
      destinatarios: s.reply_to,
      estado: s.status,
      error: s.error || null,
      creada: s.created,
      actualizada: s.updated,
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="mis-datos-msc-excel-ai.json"',
    },
  });
}
