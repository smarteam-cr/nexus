/**
 * GET /api/cobranza/produccion — la tabla del paso a producción, por proyecto (2026-11-13): quién confirma, quién cobra
 * y si ya pasó a producción. Sin montos. La regla de acceso: lib/cobranza/produccion-acceso.ts.
 */
import { NextResponse } from "next/server";
import { cargarTablaDeProduccion, equipoActivo } from "@/lib/cobranza/seguimiento-server";
import { guardProduccion } from "@/lib/cobranza/produccion-acceso-server";
import { puedeConfirmarProduccion, puedeEditarResponsables } from "@/lib/cobranza/produccion-acceso";
import { esquemaDesactualizado } from "@/lib/db/esquema";

export async function GET() {
  const q = await guardProduccion();
  if (q instanceof NextResponse) return q;
  try {
    const [filas, equipo] = await Promise.all([cargarTablaDeProduccion(), equipoActivo()]);
    return NextResponse.json({
      filas: filas.map((f) => ({ ...f, puedeConfirmar: puedeConfirmarProduccion(q, f.confirma) })),
      equipo,
      puedeEditar: puedeEditarResponsables(q),
      esquemaAtrasado: false,
    });
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    return NextResponse.json({ filas: [], equipo: [], puedeEditar: false, esquemaAtrasado: true });
  }
}
