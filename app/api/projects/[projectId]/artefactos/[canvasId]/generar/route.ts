/**
 * POST /api/projects/[projectId]/artefactos/[canvasId]/generar — generar (o regenerar) una COPIA con IA (etapa V3 de
 * docs/artefactos-plan.md, lib/artefactos/generar-server.ts). El documento de siempre se sigue generando con su botón
 * (/analyze); esta ruta lo rechaza.
 *
 * Como el botón: la celda del tipo (`generate` si la copia no tiene nada de la IA, `regenerate` si ya tiene), la corrida
 * nace en RUNNING y el trabajo corre aparte; la corrida termina en DONE o ERROR y el editor la sigue por polling
 * (`/api/projects/[projectId]/agent-runs`). Una sola corrida por copia a la vez. La corrida va con `agentId: null` y el
 * `agentSlug` del medidor («artefacto:<tipo>»): los tipos nuevos no tienen fila en `Agent`, y con fila /analyze podría
 * despacharlos sin esta puerta (el mismo criterio que el revisor del cronograma).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardPermission } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { prisma } from "@/lib/db/prisma";
import { ErrorDelArtefacto } from "@/lib/artefactos/copias-server";
import { copiaParaGenerar, generarCopia } from "@/lib/artefactos/generar-server";
import { TOPE_INSTRUCCIONES_DEL_PEDIDO } from "@/lib/entregables/registro";
import { nombreDelArtefacto } from "@/lib/artefactos/copias";

type Params = Promise<{ projectId: string; canvasId: string }>;

const cuerpo = z.strictObject({ instrucciones: z.string().max(TOPE_INSTRUCCIONES_DEL_PEDIDO).nullish() });

/** Una corrida de esta copia empezada hace menos de esto se da por en curso. */
const EN_CURSO_MS = 15 * 60_000;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { projectId, canvasId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const parsed = cuerpo.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return cuerpoInvalido(parsed.error);

  let copia: Awaited<ReturnType<typeof copiaParaGenerar>>;
  try {
    copia = await copiaParaGenerar(projectId, canvasId);
  } catch (e) {
    if (e instanceof ErrorDelArtefacto) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  // La celda sale del REGISTRO de tipos (como canvas-assist la saca del de piezas): todas las secciones tienen las dos.
  const perm = await guardPermission(
    copia.tipo.permiso as Parameters<typeof guardPermission>[0],
    (copia.yaTieneDeLaIa ? "regenerate" : "generate") as never,
  );
  if (perm instanceof NextResponse) return perm;

  const agentSlug = `artefacto:${copia.tipo.id}`;
  const quien = await triggeredByEmail();
  /* La toma, atómica: dos clics (o dos pestañas) no pagan dos corridas. La fila del documento bloqueada mientras se busca
     una corrida en curso y se crea la nueva. */
  const toma = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProjectCanvas" WHERE id = ${canvasId} FOR UPDATE`;
      const enCurso = await tx.agentRun.findFirst({
        where: { projectId, agentSlug, status: "RUNNING", sectionLabel: canvasId, createdAt: { gte: new Date(Date.now() - EN_CURSO_MS) } },
        select: { id: true },
      });
      if (enCurso) return null;
      return tx.agentRun.create({
        data: {
          agentId: null,
          agentSlug,
          clientId: guard.clientId,
          projectId,
          status: "RUNNING",
          // El nombre es lo que muestra el centro de corridas. El id de la copia dice cuál se está generando: varias
          // copias del mismo tipo conviven y comparten `agentSlug`.
          stepLabel: nombreDelArtefacto(copia.canvas),
          sectionLabel: canvasId,
          output: "{}",
          triggeredByEmail: quien,
        },
        select: { id: true },
      });
    },
    { maxWait: 5000, timeout: 10000 },
  );
  if (!toma) return NextResponse.json({ error: "Este documento ya se está generando: espera a que termine." }, { status: 409 });

  const setPhase = (fase: string) => {
    prisma.agentRun.update({ where: { id: toma.id }, data: { currentPhase: fase } }).catch(() => {});
  };
  // Aparte, como el botón de siempre: la corrida la siguen el editor y el centro de corridas.
  void (async () => {
    try {
      const r = await conContextoDeIA(
        { agentSlug, agentRunId: toma.id, clientId: guard.clientId, projectId, triggeredByEmail: quien, origen: "artefactos/generar" },
        () => generarCopia({ projectId, canvasId, agentRunId: toma.id, instrucciones: parsed.data.instrucciones ?? null, alFase: setPhase }),
      );
      await prisma.agentRun.update({ where: { id: toma.id }, data: { status: "DONE", output: JSON.stringify({ sectionCount: r.sectionCount }) } }).catch(() => {});
    } catch (err) {
      console.error("[artefactos] generar:", err);
      await prisma.agentRun
        .update({ where: { id: toma.id }, data: { status: "ERROR", output: JSON.stringify({ error: humanizeAgentError(err) }) } })
        .catch(() => {});
    }
  })();

  return NextResponse.json({ runId: toma.id }, { status: 202 });
}

/**
 * GET — la última corrida de ESTA copia: con qué se sigue el «Generando…» del editor. Por proyecto y por copia en el
 * `where` (anti-IDOR). `error` es el motivo ya humanizado.
 */
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { projectId, canvasId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const run = await prisma.agentRun.findFirst({
    where: { projectId, sectionLabel: canvasId, agentSlug: { startsWith: "artefacto:" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, currentPhase: true, output: true, createdAt: true },
  });
  if (!run) return NextResponse.json({ corrida: null });
  let error: string | null = null;
  if (run.status === "ERROR") {
    try {
      error = (JSON.parse(run.output ?? "{}") as { error?: string }).error ?? null;
    } catch {
      error = null;
    }
  }
  const enCurso = run.status === "RUNNING" && run.createdAt.getTime() > Date.now() - EN_CURSO_MS;
  return NextResponse.json({ corrida: { id: run.id, estado: enCurso ? "RUNNING" : run.status === "RUNNING" ? "ERROR" : run.status, fase: run.currentPhase, error } });
}
