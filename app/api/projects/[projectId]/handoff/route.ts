import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardProjectEditHandoff, guardProjectGenerateHandoff } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { computeHandoffReadiness } from "@/lib/handoff/feeding";
import {
  resolverDuenioDelHandoff,
  vetoSiElHandoffEsDeOtro,
  contextExclusionesPorDefecto,
  tieneOTuvoImplementacionHubSpot,
} from "@/lib/handoff/duenio";
import { createHandoffCanvas, reconcileHandoffCanvasSections } from "@/lib/canvas/default-canvases";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { elegirAgente, pipelineKeyDeProyecto, AGENTES_DEL_GRUPO } from "@/lib/agents/resolver";

type Params = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/[projectId]/handoff
 *
 * Estado del handoff de UN proyecto (handoff por-proyecto, 1:1). Devuelve si la
 * entidad existe, el canvas, si está GENERADO (canvas con ≥1 bloque), las sesiones
 * fuente del último run y cuántas sesiones tiene clasificadas el proyecto (para saber
 * si se puede generar). Lo consume ProjectHandoffSection.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  /* ¿El handoff de este proyecto es el de OTRO?
     ⚠ DESDE LA TANDA F (2026-08-07) LA RESPUESTA ES SIEMPRE NO: las tres filas de
     `PROJECT_PIPELINES` dicen `handoffDelHermano: false`, así que la rama de abajo es
     inalcanzable. Se conserva entera a propósito y no se borra: apagar por celda es
     reversible, borrar no lo es. Si dos documentos del mismo trato empiezan a contradecirse,
     esa celda vuelve a `true` y esta rama vuelve a correr sin escribir una línea.
     Lo que el hermano menor recibe en su lugar es su propio handoff + el enlace discreto de
     abajo + la nota que nombra al mayor. */
  const duenio = await resolverDuenioDelHandoff(projectId);
  if (duenio.redirigido) {
    const owner = await prisma.project.findUnique({
      where: { id: duenio.ownerProjectId },
      select: {
        clientId: true,
        canvases: { where: canvasOf("handoff"), select: { id: true }, take: 1 },
      },
    });
    const ownerCanvasId = owner?.canvases[0]?.id ?? null;
    const ownerBlocks = ownerCanvasId
      ? await prisma.canvasBlock.count({ where: { section: { canvasId: ownerCanvasId } } })
      : 0;
    return NextResponse.json({
      duenio: {
        redirigido: true as const,
        projectId: duenio.ownerProjectId,
        projectName: duenio.hermano?.name ?? null,
        clientId: owner?.clientId ?? null,
      },
      canvasId: ownerCanvasId,
      generated: ownerBlocks > 0,
      blockCount: ownerBlocks,
    });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      implementationType: true,
      // Para resolver QUÉ agente de handoff le toca a este tipo de proyecto.
      hubspotPipelineId: true,
      handoff: { select: { id: true, contextExclusions: true } },
      canvases: { where: canvasOf("handoff"), select: { id: true }, take: 1 },
      /* De quién cuelga, si cuelga. ⚠ Es un PUNTERO BLANDO (String, sin clave foránea), así
         que no se puede pedir por relación: se resuelve abajo con su propia lectura, tolerando
         que apunte a un proyecto borrado. */
      hermanoCsProjectId: true,
    },
  });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  /* El hermano mayor YA NO gobierna este documento —cada proyecto tiene el suyo desde la Tanda
     F— pero la pantalla ofrece un enlace discreto al de él: el alcance vendido sigue estando
     allá y quien lea éste probablemente quiera verlo. Un puntero a un proyecto borrado degrada
     a `null` y la pantalla simplemente no muestra el enlace. */
  const hermanoMayor = project.hermanoCsProjectId
    ? await prisma.project.findUnique({
        where: { id: project.hermanoCsProjectId },
        select: { id: true, name: true, clientId: true },
      })
    : null;

  const canvasId = project.canvases[0]?.id ?? null;
  const blockCount = canvasId
    ? await prisma.canvasBlock.count({ where: { section: { canvasId } } })
    : 0;

  const lastRun = await prisma.agentRun.findFirst({
    where: { projectId, agent: { agentGroup: "handoff" } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, status: true, sourceSessionIds: true },
  });

  let sourceSessions: { id: string; title: string; date: string }[] = [];
  if (lastRun?.sourceSessionIds?.length) {
    const sessions = await prisma.firefliesSession.findMany({
      where: { id: { in: lastRun.sourceSessionIds } },
      select: { id: true, title: true, date: true },
    });
    sourceSessions = sessions.map((s) => ({
      id: s.id,
      title: s.title ?? "(sin título)",
      date: s.date.toISOString(),
    }));
  }

  // Solo miembros (included=true): las excluidas por humano no cuentan como material.
  const projectSessionCount = await prisma.sessionProject.count({
    where: { projectId, included: true },
  });

  // Readiness: qué alimentaría el handoff HOY (política + regla) y si hay material real.
  // El front lo muestra antes de generar ("N sesiones alimentarán este handoff…").
  const handoffReadiness = await computeHandoffReadiness(projectId);

  /**
   * Id del agente de handoff — el front lo usa para disparar /analyze sin embeber el cuid.
   *
   * ⚠ POR EL RESOLVER, Y NO POR UN `findFirst` SUELTO. La versión anterior era
   * `findFirst({ where: { agentGroup: "handoff" } })` sin `orderBy` y sin filtrar `status`:
   * determinista POR ACCIDENTE mientras hubiera UNA sola fila con ese grupo. Con dos, Postgres
   * puede devolver cualquiera y una Implementación de HubSpot se generaría con el prompt de
   * Sitios web — sin error y sin log, hasta que alguien lea el documento.
   *
   * El resolver prefiere el agente del tipo del proyecto y CAE al genérico (`pipelineKey: null`),
   * que es el que existe hoy: por eso una Implementación sigue resolviendo exactamente la misma
   * fila, con el mismo prompt.
   */
  const candidatos = await prisma.agent.findMany({
    where: AGENTES_DEL_GRUPO("handoff"),
    select: { id: true, pipelineKey: true },
  });
  const handoffAgent = elegirAgente(candidatos, pipelineKeyDeProyecto(project.hubspotPipelineId));

  return NextResponse.json({
    duenio: { redirigido: false as const },
    /* El enlace discreto, no una redirección: este proyecto tiene su handoff y además sabe de
       quién cuelga. `null` cuando va solo. */
    /* El TIPO del proyecto, para que la pantalla no titule "Handoff Sales→CS" sobre un
       proyecto de Desarrollo. Viaja la key y no un rótulo armado en el servidor: `kind.ts` es
       client-safe a propósito y la pantalla ya sabe traducirla. */
    pipelineKey: pipelineKeyDeProyecto(project.hubspotPipelineId),
    hermanoMayor: hermanoMayor
      ? { projectId: hermanoMayor.id, projectName: hermanoMayor.name, clientId: hermanoMayor.clientId }
      : null,
    handoffId: project.handoff?.id ?? null,
    agentId: handoffAgent?.id ?? null,
    canvasId,
    generated: blockCount > 0,
    blockCount,
    lastRunAt: lastRun?.createdAt ?? null,
    lastRunStatus: lastRun?.status ?? null,
    sourceSessions,
    projectSessionCount,
    handoffReadiness,
    contextExclusions: project.handoff?.contextExclusions ?? null,
    implementationType: project.implementationType,
  });
}

/**
 * PATCH /api/projects/[projectId]/handoff
 *
 * Guarda las EXCLUSIONES DE CONTEXTO del CSE (texto libre, ej. "ignorá el proyecto
 * DocuSign") — se inyectan como reglas duras en el prompt del agente al generar.
 * Body: { contextExclusions: string | null }. Mismo guard de edición que el POST.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardProjectEditHandoff(projectId);
  if (guard instanceof NextResponse) return guard;
  // Las exclusiones son del handoff; si el handoff es del hermano, se editan allá.
  const veto = await vetoSiElHandoffEsDeOtro(projectId);
  if (veto) return veto;

  let body: { contextExclusions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof body.contextExclusions !== "string" && body.contextExclusions !== null) {
    return NextResponse.json({ error: "contextExclusions (string|null) requerido" }, { status: 400 });
  }
  const value =
    typeof body.contextExclusions === "string"
      ? body.contextExclusions.trim().slice(0, 5000) || null
      : null;

  // Upsert: el Handoff 1:1 puede no existir todavía (lo crea el ensure POST al generar).
  await prisma.handoff.upsert({
    where: { projectId },
    create: { clientId: guard.clientId, projectId, contextExclusions: value },
    update: { contextExclusions: value },
  });

  return NextResponse.json({ ok: true, contextExclusions: value });
}

/**
 * POST /api/projects/[projectId]/handoff
 *
 * Asegura (idempotente) la entidad Handoff + el canvas "Handoff" del proyecto, para
 * poder generar el documento. NO corre el agente (eso lo hace el cliente vía /analyze
 * async). Devuelve { handoffId, canvasId }.
 *
 * Gate: `guardProjectGenerateHandoff` (generate/regenerate/write) — NO `handoffAnywhere`
 * (=write). El ensure es prerrequisito de la generación; exigir "Editar handoff" acá dejaba
 * inútil el permiso "Regenerar con IA" (403 antes del gate de IA). El gate fino vive en /analyze.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardProjectGenerateHandoff(projectId);
  if (guard instanceof NextResponse) return guard;
  /* ACÁ es donde se impide que exista una segunda entidad `Handoff` del mismo trato — y
     por eso el `@unique` del schema no hace falta tocarlo. */
  const veto = await vetoSiElHandoffEsDeOtro(projectId);
  if (veto) return veto;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      clientId: true,
      hubspotPipelineId: true,
      handoff: { select: { id: true } },
      canvases: { where: canvasOf("handoff"), select: { id: true }, take: 1 },
    },
  });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const canvasId = project.canvases[0]?.id ?? null;
  const handoffId = project.handoff?.id ?? null;

  /* Solo se paga si de verdad se va a crear un Handoff nuevo: para el caso normal (ya existe)
     es una consulta de más en el camino más transitado de la pantalla. */
  const contextExclusions = handoffId
    ? undefined
    : contextExclusionesPorDefecto({
        hubspotPipelineId: project.hubspotPipelineId,
        tieneImplementacionHubSpot: await tieneOTuvoImplementacionHubSpot(project.clientId, projectId),
      });

  // Ensure: canvas Handoff (creado fresco con la estructura actual si falta) o RECONCILIADO
  // a la estructura canónica si ya existe (crea secciones nuevas como "desarrollo", nunca borra
  // bloques) — así el agente no descarta secciones que el canvas viejo no tenía. + entidad Handoff.
  const ensured = await prisma.$transaction(async (tx) => {
    const cId = canvasId ?? (await createHandoffCanvas(projectId, tx));
    if (canvasId) await reconcileHandoffCanvasSections(canvasId, tx);
    const hId =
      handoffId ??
      (await tx.handoff.create({
        data: {
          clientId: project.clientId,
          projectId,
          hubspotSyncStatus: "pending",
          // Desarrollo/Sitio cuya empresa tiene (o tuvo) una Implementación aparte: nace con la
          // nota de que la IA no tiene que repetir el alcance de ESA. Ver `lib/handoff/duenio.ts`.
          contextExclusions,
        },
        select: { id: true },
      })).id;
    return { canvasId: cId, handoffId: hId };
  });

  return NextResponse.json({ handoffId: ensured.handoffId, canvasId: ensured.canvasId });
}
