/**
 * GET /api/cobranza/produccion — la tabla del paso a producción, por proyecto (2026-11-13): quién confirma, quién cobra
 * y si ya pasó a producción. Sin montos. La regla de acceso: lib/cobranza/produccion-acceso.ts.
 */
import { NextResponse } from "next/server";
import { cargarTablaDeProduccion, equipoActivo } from "@/lib/cobranza/seguimiento-server";
import { equipoParaProduccion, guardProduccion } from "@/lib/cobranza/produccion-acceso-server";
import { puedeConfirmarProduccion, puedeEditarResponsables } from "@/lib/cobranza/produccion-acceso";
import { esquemaDesactualizado } from "@/lib/db/esquema";

export async function GET() {
  const q = await guardProduccion();
  if (q instanceof NextResponse) return q;
  try {
    const [filas, equipo, elegibles] = await Promise.all([cargarTablaDeProduccion(), equipoActivo(), equipoParaProduccion()]);
    return NextResponse.json({
      filas: filas.map((f) => ({ ...f, puedeConfirmar: puedeConfirmarProduccion(q, f.confirma) })),
      // `equipo` para los nombres; `elegibles` para los selectores: solo quien puede hacer lo que se le pide.
      equipo,
      elegibles,
      puedeEditar: puedeEditarResponsables(q),
      esquemaAtrasado: false,
    });
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    return NextResponse.json({ filas: [], equipo: [], elegibles: { confirma: [], cobra: [] }, puedeEditar: false, esquemaAtrasado: true });
  }
}
