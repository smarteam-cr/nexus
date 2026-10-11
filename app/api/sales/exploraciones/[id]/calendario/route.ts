/**
 * POST /api/sales/exploraciones/[id]/calendario
 *   Mira en el calendario los eventos de las sesiones unidas a una reunión agendada (etapa A, 2026-10-09;
 *   lib/exploraciones/calendario.ts › `mirarCalendario`): si se movió, la sesión toma la fecha nueva; si
 *   se canceló, queda marcada. Lo pide el lienzo al abrirse (MirarCalendario); como mucho una vez cada 10
 *   minutos por exploración y hasta 5 eventos. Solo lee Google. Pide poder ver la exploración, como la
 *   mirada a HubSpot: es el sistema poniendo al día lo que dice el calendario, no un cambio de una persona.
 */
import { NextRequest, NextResponse } from "next/server";
import { mirarCalendario } from "@/lib/exploraciones/calendario";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await mirarCalendario(id));
}
