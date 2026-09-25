/**
 * lib/timeline/borrador-del-detalle.ts — el borrador del cronograma y la corrida que arma sus TAREAS
 * (el paso 2 de «Regenerar todo» y de «Generar cronograma»). SERVER-ONLY: lee la base.
 *
 * El estado de las tareas NO se guarda (§0.4 de la especificación de E2a): se DEDUCE de la corrida
 * con `estadoDeLasTareas` (lib/timeline/borrador.ts), con el umbral único de `estaColgada`. Así no
 * hay una máquina de estados que se desincronice con la corrida real: si el proceso muere, la
 * corrida queda colgada y el borrador pasa solo a «fallo».
 *
 * E2a P2 trae la LECTURA (la usan aplicar, el descarte automático y el GET del cronograma). P4 suma
 * el paso 2 del lado del servidor, que llama POST /api/clients/[id]/analyze con `borrador`:
 *   1. `leerPedidoDeTareas` (puro): qué borrador se completa (`token` + `version`, o token null =
 *      no había propuesta de fases).
 *   2. `prevalidarPedidoDeTareas`: ANTES de crear la corrida (no se paga una que no se va a guardar).
 *   3. `marcarTareasEnCurso`: con la corrida ya creada, el borrador queda «armando» (con token null
 *      nace uno vacío). Escritura condicionada: si en el medio entró otra cosa, no se pisa.
 *   4. `estructuraParaElDetalle`: la estructura SUPUESTA que lee el agente (y que la fusión usa tal
 *      cual, en memoria: no la de 1 a 4 minutos después).
 *   5. `fusionarDetalleEnElBorrador`: lo que armó el agente se vuelve cambios de tareas del MISMO
 *      borrador. Si mientras tanto se aplicó, se descartó o se volvió a pedir, lo armado se pierde
 *      y la corrida lo dice.
 * Todas las escrituras de `projectTimeline` del paso 2 viven acá: la ruta no escribe el borrador
 * (lo vigila borrador-rutas.test.ts). Nada toca tareas del cronograma: eso es solo al aplicar.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { parseRunError } from "@/lib/agents/run-error";
import { sanitizeTags } from "@/lib/tags/catalog";
import type { HuellasDeFrontera } from "@/lib/contexto/frontera-del-cronograma";
import type { EstructuraSupuesta } from "@/lib/contexto/cronograma-para-agentes";
import {
  BLOQUEO_VERSION_NUEVA,
  borradorVacio,
  claveAleatoria,
  esBorradorV1,
  estadoDeLasTareas,
  estructuraHipotetica,
  leerBorrador,
  pedidoDelCronograma,
  versionDelBorrador,
  type EstadoDeLasTareas,
  type EstructuraHipotetica,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { MENSAJE_PROPUESTA_CAMBIO, SELECT_DE_FASE, SELECT_DE_TAREA } from "./escribir-estructura";
import { AVISO_PROPUESTA_PENDIENTE } from "./propuesta-de-estructura";
import { cambiosDeTareasDelDetalle, fusionarDetalle, tareasPropuestasDelDetalle } from "./tareas-del-detalle";

export interface EstadoDeLasTareasDelBorrador {
  estado: EstadoDeLasTareas;
  /** Solo en «armando»: la fase que reporta la corrida (`currentPhase`), o null. */
  fase: string | null;
  /** Solo en «fallo»: por qué, en palabras del CSE. null = no se sabe (la pantalla dice lo genérico). */
  motivo: string | null;
}

/* Los motivos van DESPUÉS de «No se pudieron armar las tareas: …» (`textoDeLaLineaDeTareas`): una
   causa corta, en tuteo y en minúscula. Propios y no `MOTIVO_COLGADA` (run-colgada.ts), que tiene
   voseo. */
export const MOTIVO_TAREAS_CORTADAS = "se cortó a mitad de camino, probablemente por un reinicio del servidor";
export const MOTIVO_TAREAS_SIN_GUARDAR = "la IA terminó, pero no se pudieron guardar";

/**
 * Lo que dejó escrito la corrida, traducido a la causa que lee el CSE. Revisión de E2a: se mostraba
 * tal cual, y lo guardado puede ser un código en MAYÚSCULAS («CLAUDE_ERROR», de las corridas de
 * antes del arreglo de `markDone`), el texto de la ruta o el de `humanizeAgentError` (con «Prueba de
 * nuevo» al lado del botón «Volver a intentar»). Se traduce como `errorDeLaRevisionDeFases` hace
 * con el paso 1; nunca pasa el texto crudo. null = no se sabe (la línea dice lo genérico).
 */
export function causaDelFallo(guardado: string): string | null {
  const t = guardado.toLowerCase();
  if (/no_credits|crédito|credit balance|billing/.test(t)) return "la cuenta de la IA no tiene créditos: avísale a Elías";
  if (/api key|authentication/.test(t)) return "hay un problema con la cuenta de la IA: avísale a Elías";
  if (/límite|rate limit/.test(t)) return "se pasó el límite de uso de la IA";
  if (/sobrecargada|overloaded/.test(t)) return "la IA está sobrecargada";
  if (/cortada|max_tokens/.test(t)) return "la respuesta de la IA quedó cortada";
  if (/tardó demasiado|timeout|timed out|conexión/.test(t)) return "la IA tardó demasiado o se cortó la conexión";
  if (/inválid|ilegible|invalid/.test(t)) return "la IA devolvió una respuesta que no se pudo leer";
  if (/propuesta_cambio|propuesta_pendiente|la propuesta cambió|propuesta del cronograma sin decidir/.test(t)) {
    return "la propuesta cambió mientras se armaban";
  }
  if (/claude_error|agent_error|error al ejecutar el agente|no pudo completar/.test(t)) return "la IA no respondió bien";
  return null;
}

/** Lo que se lee de la corrida del paso 2. */
export interface CorridaDeLasTareas {
  status: string;
  updatedAt: Date;
  currentPhase: string | null;
  output: string | null;
}

/**
 * Por qué fallaron las tareas, según la corrida (ya se sabe que el estado es «fallo»). Puro.
 *   · ERROR → lo que dejaron `markError` o `markDone` (el único lector de ese contrato es
 *     `parseRunError`), traducido a una causa corta (`causaDelFallo`). Sin un error propio, null;
 *   · todavía PENDING/RUNNING → está colgada (si no, el estado sería «armando»);
 *   · DONE → terminó y no se fusionó;
 *   · sin fila, o ARCHIVED → null.
 */
export function motivoDelFallo(corrida: CorridaDeLasTareas | null): string | null {
  if (!corrida) return null;
  switch (corrida.status) {
    case "ERROR": {
      const guardado = parseRunError(corrida.output);
      return guardado === parseRunError(null) ? null : causaDelFallo(guardado);
    }
    case "PENDING":
    case "RUNNING":
      return MOTIVO_TAREAS_CORTADAS;
    case "DONE":
      return MOTIVO_TAREAS_SIN_GUARDAR;
    default:
      return null;
  }
}

/**
 * El estado de las tareas del borrador guardado en `pendingProposal`. null = no es un `borrador-v1`
 * o no espera tareas (el handoff, el formato viejo). Solo lee la corrida cuando hace falta: con las
 * tareas listas, o sin corrida, la respuesta sale del JSON.
 */
export async function leerEstadoDeLasTareas(
  guardado: unknown,
  ahora: Date = new Date(),
): Promise<EstadoDeLasTareasDelBorrador | null> {
  if (!esBorradorV1(guardado)) return null;
  // La base no importa para un v1: solo se usa para convertir el formato viejo.
  const tareas = leerBorrador(guardado, { ancla: null, fases: [] })?.tareas ?? null;
  if (tareas === null) return null;
  if (tareas.listas || tareas.corrida === null) {
    const estado = estadoDeLasTareas(tareas, null, ahora);
    return estado === null ? null : { estado, fase: null, motivo: null };
  }
  const corrida = await prisma.agentRun.findUnique({
    where: { id: tareas.corrida },
    select: { status: true, updatedAt: true, currentPhase: true, output: true },
  });
  const estado = estadoDeLasTareas(tareas, corrida, ahora);
  if (estado === null) return null;
  return {
    estado,
    fase: estado === "armando" ? (corrida?.currentPhase ?? null) : null,
    motivo: estado === "fallo" ? motivoDelFallo(corrida) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL PASO 2 (E2a P4): pedir, marcar, leer la estructura supuesta y fusionar ─
// ─────────────────────────────────────────────────────────────────────────────

/** Qué borrador completa el paso 2: el que el CSE tiene enfrente (`token` + su `version`), o
 *  ninguno (`token` null: no había propuesta de fases y nace un borrador vacío). */
export interface PedidoDeTareas {
  token: string | null;
  version: number | null;
  /** Solo con token null: lo que notó el paso 1 sin proponer. Nace dentro del borrador vacío. */
  observaciones?: string[];
}

const esVersion = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
/** Techos de las observaciones del paso 1 que viajan en el pedido (el paso 1 devuelve pocas y cortas). */
const MAX_OBSERVACIONES_DEL_PEDIDO = 20;
const MAX_LARGO_DE_OBSERVACION = 1000;

/**
 * El `borrador` del body de /analyze, validado. Puro. undefined/null = no es un paso 2 del borrador
 * (pestañas viejas y «Regenerar» de una fase siguen como hoy). Con token, la versión es obligatoria:
 * sin ella no se sabe qué vio el CSE.
 * Con token null acepta `observaciones` (lo que notó el paso 1 sin proponer): el borrador vacío las
 * guarda, así la barra las muestra y sobreviven a recargar o a descartar (revisión de E2a). Con
 * token se ignoran: el borrador del paso 1 ya trae las suyas.
 */
export function leerPedidoDeTareas(raw: unknown): PedidoDeTareas | null | "invalido" {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return "invalido";
  const { token, version, observaciones } = raw as Record<string, unknown>;
  if (token === null) {
    if (version !== undefined && version !== null && !esVersion(version)) return "invalido";
    if (observaciones === undefined || observaciones === null) return { token: null, version: null };
    if (!Array.isArray(observaciones) || observaciones.length > MAX_OBSERVACIONES_DEL_PEDIDO) return "invalido";
    if (!observaciones.every((o) => typeof o === "string" && o.length <= MAX_LARGO_DE_OBSERVACION)) return "invalido";
    const limpias = [...new Set((observaciones as string[]).map((o) => o.trim()).filter((o) => o.length > 0))];
    return limpias.length > 0 ? { token: null, version: null, observaciones: limpias } : { token: null, version: null };
  }
  if (typeof token !== "string" || token.length === 0 || token.length > 200) return "invalido";
  if (!esVersion(version)) return "invalido";
  return { token, version };
}

export type CodigoDelPedido = "PROPUESTA_PENDIENTE" | "PROPUESTA_CAMBIO" | "TAREAS_EN_CURSO" | "NO_SE_PUEDE";
/** Por qué no se arman las tareas (409). `message` lo lee el CSE. */
export interface VetoDelPedido {
  error: CodigoDelPedido;
  message: string;
}

export const MENSAJE_TAREAS_EN_CURSO = "La IA ya está armando las tareas de esta propuesta: espera a que termine.";
export const MENSAJE_TAREAS_YA_LISTAS = "Las tareas de esta propuesta ya están armadas: revísala arriba del Gantt.";
export const MENSAJE_SIN_TAREAS_QUE_ARMAR =
  "Esta propuesta no espera tareas: aplícala o descártala, y después vuelve a regenerar.";
export const MOTIVO_TAREAS_PERDIDAS =
  "Mientras la IA armaba las tareas, la propuesta se aplicó, se descartó o se volvió a pedir: lo que armó no se guardó.";

const PENDIENTE: VetoDelPedido = { error: "PROPUESTA_PENDIENTE", message: AVISO_PROPUESTA_PENDIENTE };
const CAMBIO: VetoDelPedido = { error: "PROPUESTA_CAMBIO", message: MENSAJE_PROPUESTA_CAMBIO };

/**
 * Lo que se comprueba del borrador guardado antes de tocarlo (puro): que sea el que el CSE tiene
 * enfrente (su corrida y su versión) y que esta versión de Nexus lo entienda entero. Con token null,
 * que no haya ninguna propuesta.
 */
export function vetoDelGuardado(
  guardado: unknown,
  runIdGuardado: string | null,
  pedido: PedidoDeTareas,
): VetoDelPedido | null {
  if (pedido.token === null) return guardado === null ? null : PENDIENTE;
  if (runIdGuardado !== pedido.token || !esBorradorV1(guardado)) return CAMBIO;
  if (versionDelBorrador(guardado) !== pedido.version) return CAMBIO;
  const leido = leerBorrador(guardado, { ancla: null, fases: [] });
  if (!leido) return CAMBIO;
  if ((leido.desconocidos ?? 0) > 0) return { error: "NO_SE_PUEDE", message: BLOQUEO_VERSION_NUEVA };
  return null;
}

/**
 * ANTES de crear la corrida (no se paga una que no se va a guardar). Con token null no puede haber
 * ninguna propuesta abierta. Con token: la misma corrida y versión, sin cambios desconocidos, y las
 * tareas en «faltan» o «fallo» (armarlas otra vez mientras se arman, o cuando ya están, no).
 */
export async function prevalidarPedidoDeTareas(
  timelineId: string,
  pedido: PedidoDeTareas,
  ahora: Date = new Date(),
): Promise<VetoDelPedido | null> {
  const tl = await prisma.projectTimeline.findUnique({
    where: { id: timelineId },
    select: { pendingProposal: true, pendingProposalRunId: true },
  });
  if (!tl) return pedido.token === null ? null : CAMBIO;
  const veto = vetoDelGuardado(tl.pendingProposal, tl.pendingProposalRunId, pedido);
  if (veto || pedido.token === null) return veto;
  const estado = (await leerEstadoDeLasTareas(tl.pendingProposal, ahora))?.estado ?? null;
  if (estado === "faltan" || estado === "fallo") return null;
  if (estado === "armando") return { error: "TAREAS_EN_CURSO", message: MENSAJE_TAREAS_EN_CURSO };
  return { error: "NO_SE_PUEDE", message: estado === "listas" ? MENSAJE_TAREAS_YA_LISTAS : MENSAJE_SIN_TAREAS_QUE_ARMAR };
}

/**
 * Con la corrida ya creada, el borrador queda «armando» (su estado se deduce de ESTA corrida).
 *   · token null → nace un borrador vacío, solo si no hay ninguna propuesta (`DbNull`), y su token es
 *     la corrida. El pedido («regenerar» o «primera») sale de las tareas de hoy, con su única fuente,
 *     y lleva lo que notó el paso 1 (`observaciones` del pedido).
 *   · token → el guardado, con la corrida nueva y la versión + 1, condicionado a token + versión.
 * null = marcado. Si la escritura no entra (otra pestaña, otra persona), no se pisa nada.
 */
export async function marcarTareasEnCurso(i: {
  timelineId: string;
  pedido: PedidoDeTareas;
  corrida: string;
}): Promise<VetoDelPedido | null> {
  if (i.pedido.token === null) {
    const tareas = await prisma.timelineTask.findMany({
      where: { phase: { timelineId: i.timelineId } },
      select: { source: true },
    });
    const vacio = borradorVacio({
      pedido: pedidoDelCronograma(tareas),
      corrida: i.corrida,
      observaciones: i.pedido.observaciones ?? [],
    });
    const escrita = await prisma.projectTimeline.updateMany({
      where: { id: i.timelineId, pendingProposal: { equals: Prisma.DbNull } },
      data: { pendingProposal: vacio as unknown as Prisma.InputJsonValue, pendingProposalRunId: i.corrida },
    });
    return escrita.count === 0 ? PENDIENTE : null;
  }
  const tl = await prisma.projectTimeline.findUnique({
    where: { id: i.timelineId },
    select: { pendingProposal: true, pendingProposalRunId: true },
  });
  if (!tl) return CAMBIO;
  const veto = vetoDelGuardado(tl.pendingProposal, tl.pendingProposalRunId, i.pedido);
  if (veto) return veto;
  const guardado = tl.pendingProposal as Record<string, unknown>;
  const version = i.pedido.version as number;
  const escrita = await prisma.projectTimeline.updateMany({
    where: { id: i.timelineId, pendingProposalRunId: i.pedido.token, pendingProposal: { path: ["version"], equals: version } },
    data: {
      pendingProposal: {
        ...guardado,
        version: version + 1,
        tareas: { corrida: i.corrida, listas: false },
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return escrita.count === 0 ? CAMBIO : null;
}

/** Lo que se lee de cada tarea para el paso 2: lo del plan y «por validar» (las idénticas, R4b). */
const SELECT_DE_TAREA_DEL_DETALLE = { ...SELECT_DE_TAREA, needsValidation: true } as const;
const SELECT_DE_FASES_CON_TAREAS = {
  orderBy: { order: "asc" as const },
  select: {
    ...SELECT_DE_FASE,
    tasks: {
      orderBy: [{ weekIndex: "asc" as const }, { order: "asc" as const }],
      select: SELECT_DE_TAREA_DEL_DETALLE,
    },
  },
};

/** YYYY-MM-DD de una fecha fijada a mano, igual que la ve la pantalla en el cable (ISO → día). */
const diaDe = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

interface FaseLeida {
  id: string;
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  tasks: Array<{
    id: string;
    title: string;
    weekIndex: number;
    notes: string | null;
    party: string | null;
    type: string | null;
    status: string;
    source: string;
    startDateOverride: Date | null;
    dueDateOverride: Date | null;
    needsValidation: boolean;
  }>;
}

/** El cronograma de la base como lo ve el núcleo del borrador: fases en orden, CON sus tareas. */
function vivoDeLaBase(anchorStartDate: Date | null, fases: readonly FaseLeida[]): Vivo {
  return {
    ancla: anchorStartDate?.toISOString() ?? null,
    fases: fases.map((f) => ({
      id: f.id,
      name: f.name,
      durationWeeks: f.durationWeeks,
      startWeek: f.startWeek,
      sessionCount: f.sessionCount,
      notes: f.notes,
      activityType: f.activityType ?? null,
      tareas: f.tasks.map(
        (t): TareaDelVivo => ({
          id: t.id,
          title: t.title,
          weekIndex: t.weekIndex,
          notes: t.notes ?? null,
          party: (t.party ?? null) as TareaDelVivo["party"],
          type: (t.type ?? null) as TareaDelVivo["type"],
          status: t.status,
          source: t.source,
          inicioFijado: diaDe(t.startDateOverride),
          finFijado: diaDe(t.dueDateOverride),
          needsValidation: t.needsValidation,
        }),
      ),
    })),
  };
}

/**
 * La estructura SUPUESTA del borrador, para el mensaje del agente (y, en memoria, para la fusión):
 * todo lo que no choca, sin mirar lo que desmarcó el CSE. null = el borrador ya no es el que esta
 * corrida marcó (se aplicó, se descartó o se volvió a pedir): la ruta responde 409 ANTES del modelo.
 */
export async function estructuraParaElDetalle(
  timelineId: string,
  corrida: string | null,
): Promise<EstructuraSupuesta | null> {
  if (corrida === null) return null;
  const tl = await prisma.projectTimeline.findUnique({
    where: { id: timelineId },
    select: {
      pendingProposal: true,
      anchorStartDate: true,
      closeDateOverride: true,
      phases: SELECT_DE_FASES_CON_TAREAS,
    },
  });
  if (!tl || !esBorradorV1(tl.pendingProposal)) return null;
  const vivo = vivoDeLaBase(tl.anchorStartDate, tl.phases);
  const borrador = leerBorrador(tl.pendingProposal, vivo);
  if (!borrador || (borrador.desconocidos ?? 0) > 0) return null;
  if (borrador.tareas === null || borrador.tareas.listas || borrador.tareas.corrida !== corrida) return null;
  const estructura = estructuraHipotetica(vivo, borrador);
  return {
    fases: estructura.fases.map((f) => ({
      id: f.id,
      name: f.name,
      durationWeeks: f.durationWeeks,
      sessionCount: f.sessionCount,
      notes: f.notes,
      activityType: f.activityType,
    })),
    foto: {
      anchorStartDate: estructura.ancla,
      closeDateOverride: tl.closeDateOverride,
      phases: estructura.fases.map((f) => ({ id: f.id, name: f.name, durationWeeks: f.durationWeeks, startWeek: f.startWeek })),
    },
    estructura,
  };
}

export type ResultadoDeLaFusion =
  | { estado: "listas"; nuevas: number; seVan: number; observaciones: string[] }
  | { estado: "sin-cambios"; observaciones: string[] }
  | { estado: "perdido" };

/**
 * Deja un aviso en la salida de la corrida, MEZCLADO con lo que ya tenía (el GET [runId] lo expone
 * como `timelineSyncError`, igual que el handoff). Best-effort: la corrida ya terminó su trabajo.
 */
async function avisarEnLaCorrida(corrida: string, analysisJson: unknown, aviso: string): Promise<void> {
  const base = typeof analysisJson === "object" && analysisJson !== null ? analysisJson : {};
  try {
    await prisma.agentRun.update({
      where: { id: corrida },
      data: { output: JSON.stringify({ ...base, timelineSyncError: aviso }) },
    });
  } catch {
    /* sin el aviso, la pantalla dice lo genérico: no es motivo para fallar la corrida */
  }
}

/**
 * Lo que armó el agente, fusionado en el borrador que esta corrida marcó. Va DESPUÉS de guardar la
 * salida de la corrida (si la fusión falla, lo armado queda en la corrida).
 *   1. Se lee el borrador, el cronograma CON tareas (el de ahora: lo editado mientras tanto se
 *      protege) y los tags del proyecto (las fijas de la Semana 0).
 *   2. Perdido: ya no hay un v1, la corrida que lo marcó es otra, las tareas ya están, o hay cambios
 *      desconocidos. La corrida lo dice (`timelineSyncError`) y no se escribe nada.
 *   3. Las tareas se calculan sobre la estructura que VIO el agente (`estructura`, en memoria).
 *   4. Sin ningún cambio en total, el borrador se borra (condicionado a token + versión); si la IA
 *      avisó algo (se cortó, fases que no reconoció), la corrida lo dice.
 *   5. Si no, se guarda con `{ ...guardado, sus campos }`, condicionado a token + versión. Sin
 *      reintentos: mientras se arma, nadie más escribe el borrador; si no entra, se perdió.
 */
export async function fusionarDetalleEnElBorrador(i: {
  timelineId: string;
  corrida: string;
  estructura: EstructuraHipotetica;
  analysisJson: unknown;
  huellas: HuellasDeFrontera | null;
  cortado: boolean;
  /** Los tests inyectan uno determinista. */
  nuevaClave?: () => string;
}): Promise<ResultadoDeLaFusion> {
  const perdido = async (): Promise<ResultadoDeLaFusion> => {
    await avisarEnLaCorrida(i.corrida, i.analysisJson, MOTIVO_TAREAS_PERDIDAS);
    return { estado: "perdido" };
  };
  const tl = await prisma.projectTimeline.findUnique({
    where: { id: i.timelineId },
    select: {
      pendingProposal: true,
      pendingProposalRunId: true,
      anchorStartDate: true,
      project: { select: { tags: true } },
      phases: SELECT_DE_FASES_CON_TAREAS,
    },
  });
  if (!tl || !esBorradorV1(tl.pendingProposal)) return perdido();
  const version = versionDelBorrador(tl.pendingProposal);
  const vivo = vivoDeLaBase(tl.anchorStartDate, tl.phases);
  const borrador = leerBorrador(tl.pendingProposal, vivo);
  if (
    !borrador ||
    version === null ||
    (borrador.desconocidos ?? 0) > 0 ||
    borrador.tareas === null ||
    borrador.tareas.listas ||
    borrador.tareas.corrida !== i.corrida
  ) {
    return perdido();
  }

  const { propuestas, idsDesconocidos } = tareasPropuestasDelDetalle({
    estructura: i.estructura,
    analysisJson: i.analysisJson,
    huellas: i.huellas,
    cortado: i.cortado,
  });
  const cambios = cambiosDeTareasDelDetalle({
    estructura: i.estructura,
    vivo,
    propuestas,
    borrador,
    tags: sanitizeTags(tl.project?.tags ?? []),
    nuevaClave: i.nuevaClave ?? claveAleatoria,
    idsDesconocidos,
  });
  const fusionado = fusionarDetalle(borrador, cambios, i.corrida);
  const donde = {
    id: i.timelineId,
    pendingProposalRunId: tl.pendingProposalRunId,
    pendingProposal: { path: ["version"], equals: version },
  };

  if (fusionado.cambios.length === 0) {
    const borrado = await prisma.projectTimeline.updateMany({
      where: donde,
      data: { pendingProposal: Prisma.DbNull, pendingProposalRunId: null },
    });
    if (borrado.count === 0) return perdido();
    if (cambios.observaciones.length > 0) await avisarEnLaCorrida(i.corrida, i.analysisJson, cambios.observaciones.join(" "));
    return { estado: "sin-cambios", observaciones: cambios.observaciones };
  }

  const guardado = tl.pendingProposal as Record<string, unknown>;
  const escrita = await prisma.projectTimeline.updateMany({
    where: donde,
    data: {
      pendingProposal: {
        ...guardado,
        version: fusionado.version,
        observaciones: fusionado.observaciones,
        cambios: fusionado.cambios,
        tareas: fusionado.tareas,
        tareasArmadasPara: fusionado.tareasArmadasPara,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  if (escrita.count === 0) return perdido();
  return {
    estado: "listas",
    nuevas: fusionado.cambios.filter((c) => c.tipo === "tarea-nueva").length,
    seVan: fusionado.cambios.filter((c) => c.tipo === "tarea-se-va").length,
    observaciones: cambios.observaciones,
  };
}
