/**
 * POST /api/projects/[projectId]/timeline/phases/[phaseId]/apply — ⛔ LÁPIDA (E2b, 2026-09-25).
 *
 * Aplicaba el set CURADO de tareas de UNA fase (el modal de dos columnas de «Regenerar»): borraba lo
 * omitido, actualizaba y renumeraba lo que quedaba, creaba lo nuevo y parcheaba la foto publicada, sin
 * token ni versión (lo que cambiara mientras el modal estaba abierto no se notaba). Desde E2b
 * «Regenerar» de una fase deja UNA propuesta guardada (`borrador-v1` con `soloFase`) que se revisa en
 * la barra de arriba del Gantt y se aplica con POST /timeline/borrador/aplicar.
 *
 * Queda como lápida y no se borra todavía: una pestaña abierta desde antes del deploy todavía llama
 * acá. Responde 409 y NO escribe nada. Se borra en E4.
 * ⛔ `{ code, message }`, SIN `error`: el Canvas viejo lee `data?.error ?? data?.message`, y así el
 * CSE lee la frase y no un código.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";

/* No se exporta: una ruta de Next solo puede exportar sus handlers (el build lo rechaza). */
const MENSAJE_NEXUS_SE_ACTUALIZO =
  "Nexus se actualizó: recarga la página y vuelve a pedir «Regenerar» en la fase. No se aplicó nada.";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ code: "NEXUS_ACTUALIZADO", message: MENSAJE_NEXUS_SE_ACTUALIZO }, { status: 409 });
}
