/**
 * GET /api/sales/exploraciones/[id]/agendadas
 *   «Agendadas · próximas 6 semanas» del selector de «Agregar sesión» (etapa A, 2026-10-09): las reuniones
 *   con Meet que todavía no ocurren, con alguien de la empresa invitado, en tu calendario y en el de quien
 *   lleva la exploración (lib/exploraciones/calendario.ts › `agendadasParaElSelector`). En la preventa
 *   también la agenda de HubSpot. Cada una dice si ya es la sesión N. Se pide solo al abrir el selector y
 *   se guarda 2 minutos. Sin Google o sin permiso, la lista viene vacía con su `aviso`. Solo lee el
 *   calendario. Pide poder cambiar la exploración (el selector existe para agregar).
 */
import { NextRequest, NextResponse } from "next/server";
import { agendadasParaElSelector } from "@/lib/exploraciones/calendario";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { leerExploracion } from "@/lib/exploraciones/servidor";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ error: "Esa exploración no existe." }, { status: 404 });
  return NextResponse.json(await agendadasParaElSelector(lectura.fila, guard.email));
}
