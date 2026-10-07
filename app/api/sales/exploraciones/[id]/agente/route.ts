/**
 * POST /api/sales/exploraciones/[id]/agente   body: { modo: "preparar" | "leer" | "casos", sesionId? }
 *   Lanza el agente de la exploración en segundo plano (lib/exploraciones/agente.ts). 202 con la
 *   corrida. Si ya hay una viva, devuelve esa: dos corridas a la vez se pisarían lo leído.
 *   Pide `ventas.write` (gasta IA).
 *
 * GET /api/sales/exploraciones/[id]/agente
 *   La última corrida de la exploración, para seguir su fase, y la última PREPARACIÓN (`preparacion`):
 *   la pieza Preparación no relanza sola una que falló. Pide `ventas.read`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardPermission } from "@/lib/auth/api-guards";
import { parseRunError } from "@/lib/agents/run-error";
import { estaColgada, MOTIVO_COLGADA } from "@/lib/agents/run-colgada";
import { lanzarCorrida, ultimaCorrida } from "@/lib/exploraciones/agente";
import { MODOS_DE_LA_CORRIDA, type ModoDeLaCorrida } from "@/lib/exploraciones/contenido";
import { leerExploracion } from "@/lib/exploraciones/servidor";
import type { CorridaEnCurso } from "@/lib/exploraciones/seguimiento-de-corrida";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({
  modo: z.enum(MODOS_DE_LA_CORRIDA),
  sesionId: z.string().min(1).max(60).optional(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPermission("preventa", "write");
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const cuerpo = Cuerpo.safeParse(raw);
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);

  const r = await lanzarCorrida(id, cuerpo.data.modo, { triggeredByEmail: guard.user.email ?? null, sesionId: cuerpo.data.sesionId ?? null });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ runId: r.runId, yaCorria: r.yaCorria }, { status: 202 });
}

type FilaDeLaCorrida = NonNullable<Awaited<ReturnType<typeof ultimaCorrida>>>;

/** Una corrida como la ve la pantalla (`CorridaEnCurso`, lib/exploraciones/seguimiento-de-corrida.ts). */
function comoLaVeLaPantalla(r: FilaDeLaCorrida): CorridaEnCurso {
  const filtros = r.filters as { modo?: unknown } | null;
  const modo = (MODOS_DE_LA_CORRIDA as readonly unknown[]).includes(filtros?.modo) ? (filtros?.modo as ModoDeLaCorrida) : null;

  // Murió con un reinicio y nadie escribió su final: se informa como lo que es, y los botones vuelven.
  if (r.status === "RUNNING" && estaColgada(r)) {
    return {
      id: r.id,
      modo,
      estado: "ERROR",
      etiqueta: r.stepLabel,
      fase: null,
      empezo: r.createdAt.toISOString(),
      termino: r.updatedAt.toISOString(),
      propuestos: null,
      nadaNuevo: false,
      error: MOTIVO_COLGADA,
    };
  }

  let salida: { propuestos?: number; nadaNuevo?: boolean; correosSinPermiso?: number } = {};
  if (r.status === "DONE") {
    try {
      salida = JSON.parse(r.output ?? "{}");
    } catch {
      /* sin resumen */
    }
  }
  return {
    id: r.id,
    modo,
    estado: r.status as CorridaEnCurso["estado"],
    etiqueta: r.stepLabel,
    fase: r.currentPhase,
    empezo: r.createdAt.toISOString(),
    termino: r.status === "DONE" || r.status === "ERROR" ? r.updatedAt.toISOString() : null,
    propuestos: typeof salida.propuestos === "number" ? salida.propuestos : null,
    nadaNuevo: salida.nadaNuevo === true,
    error: r.status === "ERROR" ? parseRunError(r.output) : null,
  };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPermission("preventa", "read");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ corrida: null, preparacion: null });
  /* La última corrida (la que se sigue) y la última PREPARACIÓN: si falló, la pieza Preparación no la
     relanza sola al abrir, espera el botón, y dice cuándo falló (Elías, 2026-10-05). */
  const r = await ultimaCorrida(id, lectura.fila.clientId);
  // Sin corridas no hay preparación; si la última ES una preparación, es esa (una consulta menos en cada vuelta del seguimiento).
  const prep = !r ? null : (r.filters as { modo?: unknown } | null)?.modo === "preparar" ? r : await ultimaCorrida(id, lectura.fila.clientId, undefined, "preparar");
  const corrida = r ? comoLaVeLaPantalla(r) : null;
  return NextResponse.json({ corrida, preparacion: prep === r ? corrida : prep ? comoLaVeLaPantalla(prep) : null });
}
