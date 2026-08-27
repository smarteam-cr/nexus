/**
 * GET /api/business-cases/[id]/generate/status
 *
 * El estado de la generación en curso — y desde el 2026-08-21 también su DESENLACE.
 *
 * El POST /generate ya no espera: arranca la corrida y devuelve. Este GET liviano dejó de ser
 * "feedback lindo" (la fase junto al botón) para ser **el canal por el que el workspace se
 * entera de que terminó**: con qué caso de uso abrir, o con qué error avisar. Sin eso la
 * generación terminaría bien y la pantalla se quedaría mirando.
 *
 * Que el estado viva en la base y no en la pestaña es, además, lo que hace que recargar a
 * mitad de una generación retome el spinner en vez de perderla.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

/**
 * `output` guarda JSON en el éxito y el mensaje pelado en el fallo.
 * Se lee tolerante a propósito: las corridas ANTERIORES a este cambio terminaron en DONE con
 * el `output` vacío, y una propuesta vieja no tiene por qué romper la pantalla.
 */
function leerSalida(output: string | null): { canvasId: string | null; version: number | null } {
  if (!output) return { canvasId: null, version: null };
  try {
    const o = JSON.parse(output) as { canvasId?: unknown; version?: unknown };
    return {
      canvasId: typeof o.canvasId === "string" ? o.canvasId : null,
      version: typeof o.version === "number" ? o.version : null,
    };
  } catch {
    return { canvasId: null, version: null };
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const run = await prisma.agentRun.findFirst({
    where: { businessCaseId: id, agentSlug: "business-case" },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, currentPhase: true, output: true, createdAt: true },
  });
  if (!run) {
    return NextResponse.json({ runId: null, status: null, phase: null, canvasId: null, version: null, error: null });
  }

  const { canvasId, version } = leerSalida(run.output);
  return NextResponse.json({
    runId: run.id,
    status: run.status,
    phase: run.currentPhase,
    startedAt: run.createdAt,
    canvasId,
    version,
    // En ERROR el `output` ES el mensaje. Hasta hoy moría ahí: el POST devolvía el error y
    // nadie volvía a leer la corrida, así que una generación que fallaba con la pestaña
    // cerrada no dejaba rastro en pantalla. Son 7 de las últimas 47.
    error: run.status === "ERROR" ? (run.output ?? "La generación falló.") : null,
  });
}
