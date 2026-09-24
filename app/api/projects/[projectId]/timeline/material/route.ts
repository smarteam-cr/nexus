import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { cargarMaterialDelCronograma } from "@/lib/contexto/cargar";

/**
 * GET /api/projects/[projectId]/timeline/material — QUÉ LE LLEGA A LA IA DEL «CONTEXTO DEL
 * CRONOGRAMA» (2026-09-23).
 *
 * Devuelve el INFORME del material: por cada reunión elegida, si entra completa, recortada (y
 * cuánto), no entra, no dejó contenido o todavía no ocurrió; y el conteo de las notas. Con eso la
 * pantalla pinta la línea cerrada, el aviso y las insignias de cada reunión.
 *
 * ── LA PANTALLA Y EL PROMPT SALEN DEL MISMO LUGAR ────────────────────────────
 * Se llama al MISMO cargador que usan el detalle y «Pedir cambio con IA», con los mismos topes: el
 * informe sale del plan que arma el bloque (`planDelMaterial`). Un cálculo aparte para la pantalla
 * terminaría diciendo «entra completa» sobre una reunión que la IA lee cortada.
 *
 * ⛔ NUNCA devuelve texto de reuniones ni de notas: solo el informe (títulos, estados y conteos).
 * El material es interno y esta ruta la lee cualquiera con acceso al proyecto.
 *
 * Solo lectura: el guard es el de acceso al proyecto, como el GET de las notas.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  try {
    const { informe } = await cargarMaterialDelCronograma(projectId);
    return NextResponse.json(informe);
  } catch (e) {
    console.error("[timeline/material] no se pudo armar el informe:", e);
    return NextResponse.json({ error: "No se pudo leer el material del cronograma." }, { status: 500 });
  }
}
