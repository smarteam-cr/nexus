/**
 * POST /api/projects/[projectId]/timeline/detail/apply-all — ⛔ LÁPIDA (E2b, 2026-09-25).
 *
 * Aplicaba el set CURADO de tareas de TODAS las fases (el acordeón de dos columnas de «Regenerar
 * todo», Tanda N): borraba lo omitido, actualizaba y renumeraba lo que quedaba, creaba lo nuevo y
 * parcheaba la foto publicada, sin token ni versión. Desde E2a «Regenerar todo» deja UNA propuesta
 * guardada (`borrador-v1`, con fases y tareas) que se revisa en la barra de arriba del Gantt y se
 * aplica con POST /timeline/borrador/aplicar. En E2b se borró el acordeón, con su panel y
 * lib/timeline/apply-curated-phase.ts.
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
  "Nexus se actualizó: recarga la página y vuelve a «Regenerar todo». No se aplicó nada.";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ code: "NEXUS_ACTUALIZADO", message: MENSAJE_NEXUS_SE_ACTUALIZO }, { status: 409 });
}
