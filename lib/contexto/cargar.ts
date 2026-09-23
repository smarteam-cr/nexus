/**
 * lib/contexto/cargar.ts — EL CARGADOR SERVER-SIDE DEL CONTEXTO NOMBRADO.
 * Server-only (Prisma). La parte pura (fuentes, reglas, template) vive en
 * `./detalle-cronograma.ts`; los tipos en `./tipos.ts`.
 *
 * Una función por pieza registrada en PIEZAS_CON_CONTEXTO_NOMBRADO. Cada una compone los
 * loaders EXISTENTES (que ya llevan la procedencia adentro y pasan por el embudo del
 * handoff) y devuelve un ContextoDeProyecto: por primera vez, «lo que ve el agente» es un
 * valor con nombre que se puede loguear, testear y auditar — no un tramo de template.
 */
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { loadHandoffContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { loadDesarrolloContext } from "@/lib/canvas/desarrollo-context";
import { bloqueDeInstruccionesDeDoc, docBriefFrom } from "@/lib/business-cases/section-briefs";
import { resolvePipeline, type ProjectPipelineKey } from "@/lib/projects/kind";
import type { ContextoDeProyecto } from "./tipos";
import { fuentesDelDetalle } from "./detalle-cronograma";
import { fuentesDelAssist } from "./asistente-cronograma";
import { bloqueDeOperativa } from "@/lib/cs/hubspot-ops-block";
import { getProjectTimelineSessions } from "@/lib/sessions/project-sources";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { etiquetaDeSala, prefijoDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { getSessionCategories } from "@/lib/cache/session-categories";
import { HANDOFF_SESSION_CHAR_TIERS } from "@/lib/handoff/session-budget";
import { soloOcurridas } from "@/lib/sessions/ocurridas";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import {
  MAX_REUNIONES_A_LEER,
  bloqueDeNotasDelCronograma,
  bloqueDeReunionesDelCronograma,
  repartirEspacio,
  type NotaParaElCronograma,
  type ReunionParaElCronograma,
} from "./material-cronograma";

/**
 * El contexto del Detalle de Cronograma (pieza "timeline"):
 *   · cronograma-actual      — las fases existentes CON ids (el agente referencia, no crea)
 *   · handoff-curado         — SOLO bloques confirmados por el CSE (onlyConfirmed)
 *   · requerimiento-tecnico  — el canvas Desarrollo si existe ("" si no)
 *   · instrucciones          — la entry `__doc` del canvas del cronograma (X1); "" sin brief
 *
 * Sin fechas en el contexto a propósito: el agente no las calcula.
 */
export async function cargarContextoDelDetalle(
  projectId: string,
  pipelineKey: ProjectPipelineKey | null = null,
): Promise<ContextoDeProyecto> {
  const [handoffCtx, timelineCtx, desarrolloCtx, canvasCronograma, mat] = await Promise.all([
    loadHandoffContext(projectId, { onlyConfirmed: true }),
    loadTimelineContext(projectId, { includeIds: true }),
    loadDesarrolloContext(projectId),
    prisma.projectCanvas.findFirst({
      where: { projectId, ...canvasOf("timeline") },
      select: { sections: true },
    }),
    // ÚLTIMO a propósito: el censo de handoff-al-cliente mide la distancia hasta el embudo.
    cargarMaterialDelCronograma(projectId),
  ]);
  return {
    projectId,
    pipelineKey,
    fuentes: fuentesDelDetalle({
      timelineCtx,
      handoffCtx,
      desarrolloCtx,
      reunionesCtx: mat.reuniones,
      notasCtx: mat.notas,
    }),
    instrucciones: bloqueDeInstruccionesDeDoc(
      canvasCronograma ? docBriefFrom(canvasCronograma.sections) : null,
    ),
  };
}

/**
 * El contexto del MODIFICADOR de cronograma (pieza "assist"): el agente que atiende
 * «atrasá Setup una semana» / «agregá tareas de migración en configuración».
 *
 *   · cronograma-vivo        — el cronograma CON ids y CON el estado de cada tarea
 *   · handoff-curado         — SOLO bloques confirmados por el CSE
 *   · requerimiento-tecnico  — el canvas Desarrollo si existe ("" si no)
 *   · operativa-hubspot      — estado / prioridad / motivo de bloqueo, si el equipo los cargó
 *   · instrucciones          — la misma entry `__doc` del canvas del cronograma que lee el detalle
 *
 * ⚠ EL CRONOGRAMA LO PASA EL LLAMADOR, no se carga acá. La ruta ya lo trae con su select
 * propio —necesita `status` y `source` para el rescate de progreso del final— y volver a
 * leerlo abriría la puerta a que las dos lecturas se separen: la que el modelo ve y la que el
 * servidor protege tienen que ser LA MISMA.
 *
 * ⚠ Las instrucciones salen del canvas "timeline", no de uno propio: el brief `__doc` es
 * «instrucciones para esta PIEZA», y el modificador edita la misma pieza que el detalle.
 * Si tuvieran cajas separadas, el CSE escribiría una regla y solo la mitad de los agentes
 * la leería.
 */
export async function cargarContextoDelAssist(
  projectId: string,
  cronogramaCtx: string,
): Promise<ContextoDeProyecto> {
  const [handoffCtx, desarrolloCtx, canvasCronograma, proyecto, mat] = await Promise.all([
    loadHandoffContext(projectId, { onlyConfirmed: true }),
    loadDesarrolloContext(projectId),
    prisma.projectCanvas.findFirst({
      where: { projectId, ...canvasOf("timeline") },
      select: { sections: true },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        // El tipo sale del pipeline, nunca se guarda (regla del multipipeline).
        hubspotPipelineId: true,
        hubspotStatus: true,
        hubspotPriority: true,
        hubspotBlockReason: true,
        hubspotBlockDetail: true,
        hubspotAdoptionState: true,
      },
    }),
    // ÚLTIMO a propósito, igual que en el detalle: el censo mide la distancia hasta el embudo.
    cargarMaterialDelCronograma(projectId),
  ]);
  return {
    projectId,
    pipelineKey: resolvePipeline(proyecto?.hubspotPipelineId ?? null)?.key ?? null,
    fuentes: fuentesDelAssist({
      cronogramaCtx,
      handoffCtx,
      desarrolloCtx,
      operativaCtx: proyecto ? bloqueDeOperativa(proyecto, { incluirRotulo: false }) : "",
      reunionesCtx: mat.reuniones,
      notasCtx: mat.notas,
    }),
    instrucciones: bloqueDeInstruccionesDeDoc(
      canvasCronograma ? docBriefFrom(canvasCronograma.sections) : null,
    ),
  };
}

/**
 * EL MATERIAL DEL «CONTEXTO DEL CRONOGRAMA» (2026-09-23): las reuniones que el CSE deja entrar y
 * las notas que pegó a mano, ya rotuladas para el agente (ver ./material-cronograma.ts).
 *
 * Lo leen el detalle (tareas y cuáles son reuniones) y «Pedir cambio con IA» (el único que puede
 * tocar fases). Devuelve `""` en lo que no haya: los armadores omiten la fuente vacía y el prompt
 * de un proyecto sin material queda byte-idéntico al de antes.
 *
 * ── CÓMO SE REPARTE EL ESPACIO ───────────────────────────────────────────────
 * Por defecto entran TODAS las reuniones del proyecto (la regla de `session-feeding.ts`), así que
 * con 60 reuniones no caben enteras. Primero se LEEN (las agregadas a mano todas; del resto, las
 * `MAX_REUNIONES_A_LEER` más recientes), se descartan las que no dejaron nada, y recién ahí se
 * reparte con `repartirEspacio` (puro, en ./material-cronograma.ts, con su test): las que el CSE
 * AGREGÓ A MANO van primero con su propio cupo. Repartir antes de leer le daba las cotas grandes a
 * reuniones vacías y dejaba la que tenía material con 400 caracteres (revisión 2026-09-23).
 *
 * ⚠ Las reuniones salen del chokepoint (`getProjectTimelineSessions` → `getProjectMemberSessions`):
 * la pertenencia al cliente y el tombstone no se re-implementan acá. Las futuras se cortan con
 * `soloOcurridas`, la misma regla que usa todo lector de reuniones.
 */
export async function cargarMaterialDelCronograma(
  projectId: string,
): Promise<{ reuniones: string; notas: string }> {
  const [{ sessions }, notas, categorias] = await Promise.all([
    getProjectTimelineSessions(projectId),
    leerNotasDelCronograma(projectId),
    getSessionCategories(),
  ]);
  const dominiosPropios = buildInternalDomainsSet(categorias);
  const ahora = Date.now();

  const pasadas = soloOcurridas(sessions, ahora).sort((a, b) => b.date - a.date);
  const aLeer = [
    ...pasadas.filter((s) => s.timelineOverride === true),
    ...pasadas.filter((s) => s.timelineOverride !== true).slice(0, MAX_REUNIONES_A_LEER),
  ];

  /* De a tandas: con 50 reuniones, un Promise.all abriría 50 lecturas de transcript a la vez contra
     el mismo pool que atiende la pantalla. Cada lectura trae como mucho la cota más grande del
     reparto; después se recorta a la que le toque, sin volver a leer. */
  const contenidoPorId = new Map<string, string>();
  for (let i = 0; i < aLeer.length; i += 8) {
    const tanda = aLeer.slice(i, i + 8);
    const leidos = await Promise.all(
      tanda.map((s) => fetchTranscriptContent(s.id, s.title, { maxChars: HANDOFF_SESSION_CHAR_TIERS[0] })),
    );
    tanda.forEach((s, k) => {
      const c = leidos[k];
      if (c && c.trim()) contenidoPorId.set(s.id, c);
    });
  }

  const conContenido = aLeer.filter((s) => contenidoPorId.has(s.id));
  const espacio = repartirEspacio(
    conContenido.map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date,
      agregadaAMano: s.timelineOverride === true,
    })),
    ahora,
  );

  const reuniones: ReunionParaElCronograma[] = conContenido
    .filter((s) => espacio.has(s.id))
    .map((s) => ({
      title: s.title,
      date: s.date,
      prefijoDeSala: prefijoDeSala(etiquetaDeSala({ participants: s.participants }, dominiosPropios)),
      contenido: (contenidoPorId.get(s.id) ?? "").slice(0, espacio.get(s.id)),
      agregadaAMano: s.timelineOverride === true,
    }))
    // En orden cronológico: el cronograma se lee como una historia.
    .sort((a, b) => a.date - b.date);

  return {
    reuniones: bloqueDeReunionesDelCronograma(reuniones),
    notas: bloqueDeNotasDelCronograma(notas),
  };
}

/** Solo las NOTAS (el agente de avance lee sus reuniones por su propio camino). */
export async function cargarNotasDelCronograma(projectId: string): Promise<string> {
  return bloqueDeNotasDelCronograma(await leerNotasDelCronograma(projectId));
}

/**
 * Las notas vivas del proyecto. La tolerancia a que la tabla falte cubre solo un SQL aplicado a
 * medias: sin la columna `timelineOverride` (el mismo SQL), la lectura de reuniones de arriba ya
 * habría reventado. El orden obligatorio sigue siendo SQL → deploy.
 */
async function leerNotasDelCronograma(projectId: string): Promise<NotaParaElCronograma[]> {
  if (!modeloDisponible(prisma.timelineSource)) return [];
  try {
    return await prisma.timelineSource.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { title: true, content: true },
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}
