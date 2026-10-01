/**
 * POST /api/sales/exploraciones/[id]/agente   body: { modo: "preparar" | "leer" | "casos", sesionId? }
 *   Lanza el agente de la exploración en segundo plano (lib/exploraciones/agente.ts). 202 con la
 *   corrida. Si ya hay una viva, devuelve esa: dos corridas a la vez se pisarían lo leído.
 *   Pide `ventas.write` (gasta IA).
 *
 * GET /api/sales/exploraciones/[id]/agente
 *   La última corrida de la exploración, para seguir su fase. Pide `ventas.read`.
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

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({
  modo: z.enum(MODOS_DE_LA_CORRIDA),
  sesionId: z.string().min(1).max(60).optional(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPermission("ventas", "write");
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

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPermission("ventas", "read");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ corrida: null });
  const r = await ultimaCorrida(id, lectura.fila.clientId);
  if (!r) return NextResponse.json({ corrida: null });
  const filtros = r.filters as { modo?: unknown } | null;
  const modo = (MODOS_DE_LA_CORRIDA as readonly unknown[]).includes(filtros?.modo) ? (filtros?.modo as ModoDeLaCorrida) : null;

  // Murió con un reinicio y nadie escribió su final: se informa como lo que es, y los botones vuelven.
  if (r.status === "RUNNING" && estaColgada(r)) {
    return NextResponse.json({
      corrida: { id: r.id, modo, estado: "ERROR", etiqueta: r.stepLabel, fase: null, empezo: r.createdAt.toISOString(), propuestos: null, nadaNuevo: false, error: MOTIVO_COLGADA },
    });
  }

  let salida: { propuestos?: number; nadaNuevo?: boolean; correosSinPermiso?: number } = {};
  if (r.status === "DONE") {
    try {
      salida = JSON.parse(r.output ?? "{}");
    } catch {
      /* sin resumen */
    }
  }
  return NextResponse.json({
    corrida: {
      id: r.id,
      modo,
      estado: r.status,
      etiqueta: r.stepLabel,
      fase: r.currentPhase,
      empezo: r.createdAt.toISOString(),
      propuestos: typeof salida.propuestos === "number" ? salida.propuestos : null,
      nadaNuevo: salida.nadaNuevo === true,
      error: r.status === "ERROR" ? parseRunError(r.output) : null,
    },
  });
}
