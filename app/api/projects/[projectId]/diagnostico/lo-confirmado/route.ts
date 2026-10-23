/**
 * /api/projects/[projectId]/diagnostico/lo-confirmado — cuánto de lo que lee el diagnóstico lo confirmó una persona
 * (2026-10-23, lib/canvas/diagnostico-confirmado.ts). Solo lectura.
 *
 *   GET → { piezas, casiNada, conAlgoConfirmado, conAlgo, reuniones, mensaje }
 *
 * Lo pinta «Antes de generar» del diagnóstico. El mismo cálculo frena `/analyze` sin `aSabiendas`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { loConfirmadoDelProyecto } from "@/lib/canvas/diagnostico-confirmado-server";
import { mensajeDeSupuestos } from "@/lib/canvas/diagnostico-confirmado";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!z.string().cuid().safeParse(projectId).success) return NextResponse.json({ error: "Proyecto inválido" }, { status: 400 });
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const r = await loConfirmadoDelProyecto(projectId);
  return NextResponse.json({ ...r, mensaje: mensajeDeSupuestos(r) });
}
