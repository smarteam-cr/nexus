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
import { Prisma } from "@prisma/client";
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
import { etiquetaDeSala, prefijoDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { getSessionCategories } from "@/lib/cache/session-categories";
import { soloOcurridas, yaOcurrio } from "@/lib/sessions/ocurridas";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import {
  MAX_REUNIONES_A_LEER,
  TECHO_POR_REUNION,
  UMBRAL_RESUMEN_FLACO,
  bloqueDeNotasDelCronograma,
  bloqueDeReunionesDelCronograma,
  calendarioDelCronograma,
  contenidoDeReunion,
  planDelMaterial,
  resumenDeReunion,
  ubicarEnElCronograma,
  type ContenidoDeReunion,
  type FotoDelCronograma,
  type InformeDelMaterial,
  type NotaParaElCronograma,
  type ReunionElegida,
} from "./material-cronograma";

/**
 * El contexto del Detalle de Cronograma (pieza "timeline"):
 *   · cronograma-actual      — las fases existentes CON ids (el agente referencia, no crea)
 *   · handoff-curado         — SOLO bloques confirmados por el CSE (onlyConfirmed)
 *   · requerimiento-tecnico  — el canvas Desarrollo si existe ("" si no)
 *   · instrucciones          — la entry `__doc` del canvas del cronograma (X1); "" sin brief
 *   · reuniones / notas      — lo que el CSE eligió en el «Contexto del cronograma» (abajo);
 *                              se omiten si no hay nada
 *   · calendario             — el del plan, de solo lectura y SIN «Hoy»; solo con material
 *
 * Sin fechas en lo que el agente ESCRIBE: el sistema las calcula. Con material, cada reunión
 * llega con su fecha y el lugar del plan donde cayó, y el cargador del material arma además un
 * calendario de solo lectura para ubicarlas.
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
      // SIN «Hoy»: con él, el detalle vaciaba las semanas pasadas aunque su trabajo no estuviera hecho.
      calendarioCtx: mat.calendario,
    }),
    instrucciones: bloqueDeInstruccionesDeDoc(
      canvasCronograma ? docBriefFrom(canvasCronograma.sections) : null,
    ),
    sesionesUsadas: mat.sesionesUsadas,
    materialInterno: mat.materialInterno,
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
 *   · reuniones / notas      — lo elegido en el «Contexto del cronograma», igual que el detalle
 *   · calendario             — el del plan CON «Hoy» (edita un cronograma vivo); solo con material
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
      // CON «Hoy»: este agente edita un cronograma vivo y tiene que saber qué semanas ya pasaron.
      calendarioCtx: mat.calendarioConHoy,
    }),
    instrucciones: bloqueDeInstruccionesDeDoc(
      canvasCronograma ? docBriefFrom(canvasCronograma.sections) : null,
    ),
    sesionesUsadas: mat.sesionesUsadas,
    materialInterno: mat.materialInterno,
  };
}

export interface OpcionesDelMaterial {
  /** Tope total de caracteres de reuniones (el chat usa uno menor). Default: TOPE_REUNIONES_CRONOGRAMA. */
  topeReuniones?: number;
  /** Cuántas elegidas se leen como máximo, las más recientes primero. Default: MAX_REUNIONES_A_LEER. */
  maxALeer?: number;
  /** La foto del plan que ya tiene quien llama (ancla + fases en orden). Sin esto se lee el cronograma. */
  fases?: FotoDelCronograma | null;
  /**
   * Las reuniones SIN su lugar en el plan (el chat): con la ubicación, cada cambio de fases cambia
   * el bloque y la caché del chat se vuelve a cobrar, aunque el CSE no haya tocado lo elegido. Los
   * calendarios se arman igual.
   */
  sinUbicacion?: boolean;
}

export interface MaterialDelCronograma {
  /** El bloque de reuniones para el agente ("" sin reuniones con contenido). */
  reuniones: string;
  /** El bloque de notas para el agente ("" sin notas). */
  notas: string;
  /** El calendario del plan SIN «Hoy» ("" sin material, sin fases o sin ancla). */
  calendario: string;
  /** El mismo calendario CON «Hoy». */
  calendarioConHoy: string;
  /** Qué entró de cada reunión elegida — lo que ve el CSE. Nunca trae texto de reuniones ni notas. */
  informe: InformeDelMaterial;
  /** Ids de las reuniones que le llegan a la IA. */
  sesionesUsadas: string[];
  /** Los textos que entraron, para revisar la salida contra la frontera. ⛔ Nunca se renderiza. */
  materialInterno: string[];
}

/**
 * EL MATERIAL DEL «CONTEXTO DEL CRONOGRAMA» (2026-09-23): las reuniones que el CSE ELIGIÓ y las
 * notas que pegó a mano, ya rotuladas para el agente (ver ./material-cronograma.ts).
 *
 * Lo leen el detalle (tareas, su semana, cuáles son reuniones y quién las hace — NO fases ni
 * duraciones: las tiene prohibidas) y «Pedir cambio con IA» (que sí puede tocar fases, pero solo
 * lo que pide la instrucción). ⚠ NO lo leen el agente de handoff —que arma y re-propone las fases—
 * ni, por ahora, el chat del cronograma. Devuelve `""` en lo que no haya: los armadores omiten la
 * fuente vacía y el prompt de un proyecto sin material queda byte-idéntico al de antes.
 *
 * ── QUÉ SE LEE (lector propio, validación del 2026-09-23) ────────────────────
 * Ya no se usa el lector del handoff (`fetchTranscriptContent`): traía el transcript ENTERO de cada
 * reunión (de 7k a 61k en CAV) y cortaba el resumen en 1.500 caracteres. `leerContenidoDeReuniones`
 * hace UNA consulta con el resumen y la minuta, y trae el INICIO del transcript (cortado en SQL,
 * nunca el blob) solo de las reuniones cuyo resumen queda flaco.
 *
 * ── CÓMO SE REPARTE EL ESPACIO ───────────────────────────────────────────────
 * Entran SOLO las reuniones elegidas (la regla de `session-feeding.ts`), pero igual pueden no caber
 * enteras. Primero se LEEN (las `MAX_REUNIONES_A_LEER` más recientes), y recién ahí `planDelMaterial`
 * reparte con `repartirEspacio`, en partes JUSTAS (piso, parte principal, cola; ver
 * ./material-cronograma.ts, con su test): una reunión vieja que el CSE eligió a propósito no queda
 * en dos líneas. El mismo plan arma el INFORME que ve el CSE, así que pantalla y prompt no pueden
 * decir cosas distintas.
 *
 * ── LA FOTO DEL PLAN ─────────────────────────────────────────────────────────
 * Con material, cada reunión lleva el lugar del plan donde cayó y se arman dos calendarios de solo
 * lectura: `calendario` (sin «Hoy», para el detalle: con hoy vaciaría las semanas pasadas aunque su
 * trabajo no esté hecho) y `calendarioConHoy`. Quien ya tiene las fases (el revisor de fases de
 * «Regenerar todo») pasa `opts.fases`, para que el modelo y el armador vean LA MISMA foto; si no, se
 * lee el cronograma (con el cierre fijado a mano, si lo hay). Sin material, los dos calendarios son
 * "". El chat pide `opts.sinUbicacion`: sus reuniones no cambian cuando se mueve una fase.
 *
 * ⚠ Las cuatro opciones las fija lib/contexto/cargar-material.test.ts llamando a esta función: una
 * opción que se ignora en silencio le da al chat el tope de 32.000 o al revisor de fases otra foto.
 *
 * ⚠ Las reuniones salen del chokepoint (`getProjectTimelineSessions` → `getProjectMemberSessions`):
 * la pertenencia al cliente y el tombstone no se re-implementan acá. Las futuras se cortan con
 * `soloOcurridas`, la misma regla que usa todo lector de reuniones, y la consulta del contenido
 * vuelve a cortar por fecha: una agendada que el CSE eligió sale en el informe («Aún no ocurrió»),
 * nunca en el prompt.
 */
export async function cargarMaterialDelCronograma(
  projectId: string,
  opts: OpcionesDelMaterial = {},
): Promise<MaterialDelCronograma> {
  const [{ sessions }, notas, categorias, foto] = await Promise.all([
    getProjectTimelineSessions(projectId),
    leerNotasDelCronograma(projectId),
    getSessionCategories(),
    opts.fases !== undefined ? Promise.resolve(opts.fases) : leerFotoDelCronograma(projectId),
  ]);
  const dominiosPropios = buildInternalDomainsSet(categorias);
  const ahora = Date.now();

  // Las más recientes primero; a la misma hora, por id: el mismo material da el mismo texto.
  const aLeer = soloOcurridas(sessions, ahora)
    .sort((a, b) => b.date - a.date || a.id.localeCompare(b.id))
    .slice(0, opts.maxALeer ?? MAX_REUNIONES_A_LEER);
  const contenidos = await leerContenidoDeReuniones(
    aLeer.map((s) => s.id),
    ahora,
  );

  const hayMaterial =
    [...contenidos.values()].some((c) => c.texto.trim()) || notas.some((n) => n.content.trim());
  const ubicar = (ms: number) => (!opts.sinUbicacion && hayMaterial ? ubicarEnElCronograma(foto, ms) : "");

  const leidas = new Set(aLeer.map((s) => s.id));
  const elegidas: ReunionElegida[] = sessions.map((s) => ({
    id: s.id,
    title: s.title,
    date: s.date,
    prefijoDeSala: prefijoDeSala(etiquetaDeSala({ participants: s.participants }, dominiosPropios)),
    ubicacion: ubicar(s.date) || undefined,
    lectura: !yaOcurrio(s.date, ahora)
      ? { tipo: "futura" }
      : leidas.has(s.id)
        ? { tipo: "leida", ...(contenidos.get(s.id) ?? { texto: "", esencial: 0 }) }
        : { tipo: "sin-leer" },
  }));
  const plan = planDelMaterial({ elegidas, notas, topeReuniones: opts.topeReuniones });

  return {
    reuniones: bloqueDeReunionesDelCronograma(plan.reuniones),
    notas: bloqueDeNotasDelCronograma(notas),
    calendario: hayMaterial ? calendarioDelCronograma(foto, ahora) : "",
    calendarioConHoy: hayMaterial ? calendarioDelCronograma(foto, ahora, { conHoy: true }) : "",
    informe: plan.informe,
    sesionesUsadas: plan.sesionesUsadas,
    materialInterno: plan.materialInterno,
  };
}

/**
 * EL LECTOR PROPIO del material: UNA consulta con el resumen y la minuta de las reuniones a leer
 * (cortada por fecha otra vez: nada que no haya ocurrido llega al prompt), y el INICIO del
 * transcript —cortado en SQL, nunca el blob entero— solo para las que quedan flacas.
 *
 * ⚠ Vive ANTES de `cargarNotasDelCronograma` a propósito: los tests cortan cada cargador hasta la
 * siguiente `export async function`, y este lector es parte del tramo del material.
 *
 * @returns id → contenido armado. Una reunión que no está en el mapa no se pudo leer.
 */
async function leerContenidoDeReuniones(
  ids: readonly string[],
  ahora: number,
): Promise<Map<string, ContenidoDeReunion>> {
  if (ids.length === 0) return new Map();
  const filas = await prisma.firefliesSession.findMany({
    where: { id: { in: [...ids] }, date: { lte: new Date(ahora) } },
    select: {
      id: true,
      title: true,
      summary: true,
      minute: { select: { summary: true, decisions: true, agreements: true, risks: true, status: true } },
    },
  });
  const resumenes = new Map(
    filas.map((f) => [f.id, resumenDeReunion({ title: f.title, summary: f.summary, minuta: f.minute })]),
  );
  const flacas = filas.filter((f) => (resumenes.get(f.id)?.texto.length ?? 0) < UMBRAL_RESUMEN_FLACO).map((f) => f.id);
  const inicios = new Map<string, string>();
  if (flacas.length > 0) {
    const filasConInicio = await prisma.$queryRaw<{ id: string; inicio: string | null }[]>`
      SELECT "id", left("transcript", ${TECHO_POR_REUNION}::int) AS "inicio"
      FROM "FirefliesSession"
      WHERE "id" IN (${Prisma.join(flacas)})`;
    for (const f of filasConInicio) if (f.inicio?.trim()) inicios.set(f.id, f.inicio);
  }
  return new Map(
    filas.map((f) => [f.id, contenidoDeReunion(resumenes.get(f.id)!, inicios.get(f.id) ?? null)]),
  );
}

/** La foto del plan para el calendario: el ancla, el cierre fijado a mano y las fases en orden. */
async function leerFotoDelCronograma(projectId: string): Promise<FotoDelCronograma | null> {
  return prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      anchorStartDate: true,
      closeDateOverride: true,
      phases: { orderBy: { order: "asc" }, select: { name: true, durationWeeks: true, startWeek: true } },
    },
  });
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
      // La fecha de carga va en el encabezado de cada nota: sin ella, «gana lo más reciente» no se
      // puede aplicar entre una nota y una reunión.
      select: { title: true, content: true, createdAt: true },
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}
