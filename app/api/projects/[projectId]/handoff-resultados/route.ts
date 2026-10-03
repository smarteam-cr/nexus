/**
 * /api/projects/[projectId]/handoff-resultados — los RESULTADOS MEDIBLES del handoff (2026-10-02).
 *
 * Una sola lista por proyecto (`Project.handoffResultados`): la leen el handoff y los objetivos
 * cuantitativos del diagnóstico. Ver lib/handoff/resultados-medibles.ts.
 *
 *   GET                         → { resultados, at, origen } (o lista vacía)
 *   PATCH { id, campo, valor }  → completa la línea base, la meta o el plazo de un resultado. Queda
 *                                 marcado como editado a mano: releer el handoff ya no lo pisa.
 *   POST                        → relee la sección del handoff (lib/handoff/resultados.ts).
 *
 * Escribir pide lo mismo que el contexto del diagnóstico (acceso al proyecto + generar el
 * diagnóstico): la línea base la completa quien lleva el diagnóstico.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { CAMPOS_EDITABLES, editarResultado, leerResultadosDelHandoff } from "@/lib/handoff/resultados-medibles";
import { estructurarResultadosDelHandoff } from "@/lib/handoff/resultados";
import { vetoSiElHandoffEsDeOtro } from "@/lib/handoff/duenio";

type Params = { params: Promise<{ projectId: string }> };

const SQL = "scripts/sql/2026-10-02-resultados-medibles-del-handoff.sql";
const esquemaAtrasado = () =>
  NextResponse.json({ error: `Falta aplicar la migración de los resultados medibles (${SQL}).`, esquemaAtrasado: true }, { status: 503 });

export async function GET(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  try {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { handoffResultados: true } });
    const r = leerResultadosDelHandoff(p?.handoffResultados);
    return NextResponse.json({ resultados: r?.resultados ?? [], at: r?.at ?? null, origen: r?.origen ?? null });
  } catch (e) {
    if (esquemaDesactualizado(e)) return esquemaAtrasado();
    throw e;
  }
}

const EdicionSchema = z.object({
  id: z.string().min(1).max(12),
  campo: z.enum(CAMPOS_EDITABLES),
  valor: z.string().max(600),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardContextoDelDocumento(projectId, "diagnostico");
  if (guard instanceof NextResponse) return guard;
  // El handoff de un desarrollo hermano es el de su implementación: no se escribe una segunda lista.
  const veto = await vetoSiElHandoffEsDeOtro(projectId);
  if (veto) return veto;
  const parsed = EdicionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  try {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { handoffResultados: true } });
    const actual = leerResultadosDelHandoff(p?.handoffResultados);
    if (!actual) return NextResponse.json({ error: "Este proyecto todavía no tiene resultados medibles." }, { status: 404 });
    const por = guard.teamMember.email ?? null;
    const lista = editarResultado(actual.resultados, parsed.data.id, { [parsed.data.campo]: parsed.data.valor }, por, new Date());
    if (!lista) return NextResponse.json({ error: "Ese resultado ya no existe." }, { status: 404 });
    const guardar = { ...actual, resultados: lista, origen: "edicion" as const };
    await prisma.project.update({ where: { id: projectId }, data: { handoffResultados: guardar as object } });
    return NextResponse.json({ resultados: lista, at: actual.at, origen: "edicion" });
  } catch (e) {
    if (esquemaDesactualizado(e)) return esquemaAtrasado();
    throw e;
  }
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardContextoDelDocumento(projectId, "diagnostico");
  if (guard instanceof NextResponse) return guard;
  // El handoff de un desarrollo hermano es el de su implementación: no se escribe una segunda lista.
  const veto = await vetoSiElHandoffEsDeOtro(projectId);
  if (veto) return veto;
  const r = await estructurarResultadosDelHandoff(projectId, "manual");
  if (r.status === "sin_texto") {
    return NextResponse.json({ error: "El handoff todavía no tiene escritos los resultados que el cliente necesita alcanzar." }, { status: 409 });
  }
  if (r.status === "error") {
    return NextResponse.json({ error: `No se pudieron leer los resultados: ${r.error}` }, { status: 502 });
  }
  return NextResponse.json({ resultados: r.resultados });
}
