/**
 * POST /api/projects/[projectId]/timeline/proposal/apply-items — ⛔ LÁPIDA (2026-09-24).
 *
 * Resolvía POR ÍTEM la propuesta de fases (aceptar/descartar cada sugerencia) contra el cronograma
 * VIVO: una edición a mano posterior volvía como «sugerencia» que la revertía, y la lista que se
 * aplicaba la calculaba el servidor sin saber cuál había visto el CSE. La reemplaza
 * POST /timeline/borrador/aplicar (E1 del plan «una sola propuesta del cronograma»): la revisión en
 * UNA barra, lo que choca con una edición posterior queda fuera, y el aplicar va en una transacción
 * con token primero y huella (lib/timeline/escribir-estructura.ts).
 *
 * Queda como lápida y no se borra todavía: una pestaña abierta desde antes del deploy todavía
 * llama acá. Responde 409 con un texto que le dice qué hacer, y NO escribe nada. Se borra en E4.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";

/* No se exporta: una ruta de Next solo puede exportar sus handlers (el build lo rechaza). */
const MENSAJE_NEXUS_SE_ACTUALIZO =
  "Nexus se actualizó: recarga la página para revisar la propuesta de fases con la pantalla nueva. No se aplicó nada.";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ error: "NEXUS_ACTUALIZADO", message: MENSAJE_NEXUS_SE_ACTUALIZO }, { status: 409 });
}
