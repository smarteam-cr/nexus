/**
 * /api/cobranza/produccion/[projectId] — un proyecto de la tabla del paso a producción (2026-11-13).
 *   PATCH { confirma?, cobra? } → los responsables (null = el por defecto). Quien edita Cobranza, la CSL o Super Admin.
 *   POST  { desde }             → confirma el paso a producción ese día (o lo deshace con null). La persona que lo
 *                                 confirma en ese proyecto, la CSL o Super Admin. Los servicios de cobro recurrente del
 *                                 proyecto sin cuotas arrancan ese día.
 * Reglas: lib/cobranza/produccion-acceso.ts y lib/cobranza/paso-a-produccion.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { pasoAProduccionSchema, responsablesProyectoSchema } from "@/lib/cobranza/schema";
import { guardProduccion, responsableValido } from "@/lib/cobranza/produccion-acceso-server";
import { puedeConfirmarProduccion, puedeEditarResponsables } from "@/lib/cobranza/produccion-acceso";
import { guardarResponsablesDelProyecto, quienConfirmaLaProduccion, registrarPasoAProduccion, SeguimientoError } from "@/lib/cobranza/seguimiento-server";
import { crDateParts } from "@/lib/jobs/time";

type Params = { params: Promise<{ projectId: string }> };

const errorDe = (e: unknown, donde: string) => {
  if (e instanceof SeguimientoError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`[cobranza/produccion] ${donde}`, e);
  return NextResponse.json({ error: "No se pudo guardar. Inténtalo de nuevo." }, { status: 500 });
};

export async function PATCH(req: NextRequest, { params }: Params) {
  const q = await guardProduccion();
  if (q instanceof NextResponse) return q;
  if (!puedeEditarResponsables(q)) return NextResponse.json({ error: "Los responsables los cambia la CSL o Finanzas." }, { status: 403 });
  const { projectId } = await params;
  const parsed = responsablesProyectoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  // Solo a quien puede hacerlo: quien confirma tiene que poder abrir esta pantalla, y quien cobra, Cobranza.
  if (!(await responsableValido(parsed.data.confirma, "confirma"))) {
    return NextResponse.json({ error: "Esa persona no puede abrir el paso a producción: no podría confirmarlo." }, { status: 400 });
  }
  if (!(await responsableValido(parsed.data.cobra, "cobra"))) {
    return NextResponse.json({ error: "Esa persona no ve Cobranza: no podría cargar ni perseguir el cobro." }, { status: 400 });
  }
  try {
    await guardarResponsablesDelProyecto(projectId, parsed.data, q.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorDe(e, "responsables");
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const q = await guardProduccion();
  if (q instanceof NextResponse) return q;
  const { projectId } = await params;
  const parsed = pasoAProduccionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  const { desde } = parsed.data;
  if (desde && desde > crDateParts(new Date()).dateKey) {
    return NextResponse.json({ error: "El paso a producción se confirma cuando ya pasó: elige hoy o un día anterior." }, { status: 400 });
  }
  try {
    if (!puedeConfirmarProduccion(q, await quienConfirmaLaProduccion(projectId))) {
      return NextResponse.json({ error: "La producción de este proyecto la confirma otra persona." }, { status: 403 });
    }
    return NextResponse.json({ ok: true, ...(await registrarPasoAProduccion(projectId, desde, q.email)) });
  } catch (e) {
    return errorDe(e, "paso a producción");
  }
}
