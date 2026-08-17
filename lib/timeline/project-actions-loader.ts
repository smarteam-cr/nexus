/**
 * lib/timeline/project-actions-loader.ts
 *
 * "Qué hacer" de MUCHOS proyectos a la vez, desde el servidor.
 *
 * SERVER-ONLY (importa Prisma). No lleva `import "server-only"` a propósito: ese módulo lo
 * resuelve el bundler de Next, no npm, así que un `tsx scripts/…` que lo importe revienta con
 * "Cannot find module" — y los scripts de inspección de este plan dependen de poder llamarlo.
 * Es la misma convención que `lib/cobranza/queries.ts` y `lib/marketing/queries.ts`: se declara
 * en el encabezado, no con un import.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Las acciones de un proyecto solo existían dentro de su canvas: había que abrirlo para que
 * se calcularan. Un CSE carga 13 a 17 proyectos activos, así que "¿por dónde empiezo hoy?"
 * costaba abrir 17 pestañas y leer 17 veces el mismo panel.
 *
 * Acá se resuelven todas de una. El CÁLCULO no se duplica: es el mismo módulo puro que usa el
 * canvas (`project-actions-input.ts` → `project-actions.ts`). Lo único que agrega este archivo
 * son las consultas.
 *
 * ── TRES CONSULTAS, NINGUNA POR PROYECTO ─────────────────────────────────────
 *   1. `loadPortfolio` — el summary de cada proyecto (avance, atrasos, alcance, alarmas de
 *      etapa, estancamiento). Ya es batch y ya resuelve el ciclo de vida sin N+1. Si el caller
 *      ya lo cargó, se lo pasa por `opts.portfolioRows` y no se repite — mismo patrón que
 *      `lib/cs/load-panel.ts`.
 *   2. Los cronogramas con sus fases, tareas y particularidades: lo que el summary NO trae
 *      y no debe traer (`PortfolioRow` viaja al cliente en `/api/dashboard/portfolio`; meterle
 *      todo esto lo infla para todos sus consumidores).
 *   3. Los canvas de cronograma, para poder ENLAZAR. El workspace navega por id de canvas, no
 *      por slug: sin esta consulta la bandeja lista pendientes a los que no se puede ir.
 *
 * El costo no cambia entre 13 y 17 proyectos. Las fases se leen dos veces (una dentro de
 * `loadPortfolio` para el summary, otra acá por `party` y `source`); con 32 cronogramas en la
 * base —12 de ellos sin una sola tarea— eso es ruido, y evitarlo obligaría a cambiar la forma
 * de `PortfolioRow` para sus otros cuatro consumidores.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { loadPortfolio, type PortfolioRow } from "@/lib/portfolio/load";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { partitionByValidation } from "./particularidad-state";
import { actionsFromSignals } from "./project-actions-input";
import type { ProjectAction } from "./project-actions";

export interface ProjectActionsRow {
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  /** El encargado según HubSpot (`csl_encargado`). null = proyecto huérfano. */
  cseEmail: string | null;
  /** Id del canvas de cronograma — con esto la bandeja arma el enlace profundo. */
  timelineCanvasId: string | null;
  /** El summary completo, por si el caller quiere pintar avance/atraso sin recargarlo. */
  portfolio: PortfolioRow;
  actions: ProjectAction[];
}

export async function loadProjectActions(
  clientWhere: Prisma.ClientWhereInput | null,
  opts: { portfolioRows?: PortfolioRow[]; now?: Date } = {},
): Promise<ProjectActionsRow[]> {
  const rows = opts.portfolioRows ?? (await loadPortfolio(clientWhere));
  if (rows.length === 0) return [];

  const projectIds = rows.map((r) => r.projectId);
  const now = opts.now ?? new Date();

  const [timelines, canvases] = await Promise.all([
    prisma.projectTimeline.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        projectId: true,
        anchorStartDate: true,
        detailConfirmedAt: true,
        pendingProgress: true,
        pendingProposal: true,
        pendingParticularidades: true,
        particularidades: {
          select: {
            id: true,
            kind: true,
            title: true,
            weeksImpact: true,
            convertedTaskId: true,
            needsValidation: true,
            // `sourceQuote`, `party` y `occurredAt` alimentan la detección de repetidas: sin
            // ellos, dos filas del mismo hecho con redacción distinta no se agrupan y el
            // contador de "filas repetidas" queda en cero.
            sourceQuote: true,
            party: true,
            occurredAt: true,
            // ⚠ Sin ESTO los filtros de `esCompromisoPendiente` y `sinCuantificar` quedan
            // decorativos: `estado` llega `undefined`, se lee como abierta, y cerrar una
            // desviación no apaga nada en la bandeja de cartera.
            estado: true,
          },
        },
        phases: {
          orderBy: { order: "asc" },
          select: {
            order: true,
            name: true,
            startWeek: true,
            durationWeeks: true,
            // `party` decide qué es una entrega DEL CLIENTE; `source` distingue el detalle
            // generado por el agente de las tareas que puso una persona a mano.
            tasks: { select: { id: true, title: true, weekIndex: true, status: true, party: true, source: true } },
          },
        },
      },
    }),
    prisma.projectCanvas.findMany({
      where: { projectId: { in: projectIds }, ...canvasOf("timeline") },
      select: { id: true, projectId: true },
    }),
  ]);

  const tlByProject = new Map(timelines.map((t) => [t.projectId, t]));
  const canvasByProject = new Map(
    canvases.filter((c): c is typeof c & { projectId: string } => !!c.projectId).map((c) => [c.projectId, c.id]),
  );

  return rows.map((r) => {
    const tl = tlByProject.get(r.projectId);
    const { confirmadas, sugerencias } = partitionByValidation(tl?.particularidades ?? []);
    const phases = tl?.phases ?? [];

    return {
      projectId: r.projectId,
      projectName: r.projectName,
      clientId: r.clientId,
      clientName: r.clientName,
      cseEmail: r.cseEmail,
      timelineCanvasId: canvasByProject.get(r.projectId) ?? null,
      portfolio: r,
      actions: actionsFromSignals(
        {
          anchorStartDate: tl?.anchorStartDate?.toISOString() ?? null,
          detailConfirmedAt: tl?.detailConfirmedAt?.toISOString() ?? null,
          // MISMO predicado que el canvas: "hay detalle" = alguna tarea la escribió el agente
          // (AGENT, o MODIFIED = una del agente que alguien editó). Las HUMAN sueltas no
          // cuentan, o un cronograma con una tarea a mano se leería como detallado.
          hasTasks: phases.some((p) => p.tasks.some((t) => t.source === "AGENT" || t.source === "MODIFIED")),
          pendingProgress: !!tl?.pendingProgress,
          pendingParticularidades: Array.isArray(tl?.pendingParticularidades)
            ? tl.pendingParticularidades.length
            : 0,
          pendingProposal: !!tl?.pendingProposal,
          particularidades: confirmadas,
          sugerenciasDelEquipo: sugerencias.length,
          phases,
        },
        r.summary,
        now,
      ),
    };
  });
}
