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
 *
 * E2c P2: el RECÁLCULO de las tareas de las fases desfasadas va por el mismo camino, con
 * `recalcular: { sin }` en el pedido (todo lo que el CSE desmarcó). El servidor calcula él mismo qué
 * fases están desfasadas (`desfasadasDelGuardado`), la marca va en `recalculo` y NUNCA en `tareas`
 * (que sigue en su corrida original, «listas»), el agente lee la estructura con lo desmarcado y la
 * fusión reemplaza solo las tareas de esas fases (`fusionarRecalculoEnElBorrador`). La ruta despacha
 * sin saber cuál de los dos es: lo dice el JSON guardado.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { parseRunError } from "@/lib/agents/run-error";
import { sanitizeTags } from "@/lib/tags/catalog";
import type { HuellasDeFrontera } from "@/lib/contexto/frontera-del-cronograma";
import type { EstructuraSupuesta } from "@/lib/contexto/cronograma-para-agentes";
import {
  avisoSinCambiosParaLaCorrida,
  BLOQUEO_VERSION_NUEVA,
  borradorVacio,
  claveAleatoria,
  esBorradorV1,
  esCambioDeTarea,
  esVacioEsperandoTareas,
  estadoDeLasTareas,
  estadoDelVacio,
  estructuraHipotetica,
  formaEnLaEstructura,
  leerBorrador,
  mismaForma,
  nombresEnTexto,
  pedidoDelCronograma,
  planDeAplicacion,
  versionDelBorrador,
  type Borrador,
  type EstadoDelVacio,
  type EstadoDeLasTareas,
  type EstructuraHipotetica,
  type FaseDesfasada,
  type RecalculoDelBorrador,
  type RecalculoEnElCable,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { MENSAJE_PROPUESTA_CAMBIO, SELECT_DE_FASE, SELECT_DE_TAREA } from "./escribir-estructura";
import { AVISO_PROPUESTA_PENDIENTE, MENSAJE_ESTRUCTURA_EN_CURSO } from "./propuesta-de-estructura";
import { ID_ESTRUCTURA_CRONOGRAMA, VENTANA_DEL_PASO_1_EN_CURSO_MS } from "@/lib/agents/estructura-cronograma";
import {
  cambiosDeTareasDelDetalle,
  fusionarDetalle,
  fusionarRecalculo,
  tareasPropuestasDelDetalle,
} from "./tareas-del-detalle";

export interface EstadoDeLasTareasDelBorrador {
  estado: EstadoDeLasTareas;
  /** Solo en «armando»: la fase que reporta la corrida (`currentPhase`), o null. */
  fase: string | null;
  /** Solo en «fallo»: por qué, en palabras del CSE. null = no se sabe (la pantalla dice lo genérico). */
  motivo: string | null;
  /**
   * E2c: el recálculo de las fases desfasadas, con su estado deducido de SU corrida. Ausente = no hay.
   * Viaja en el GET dentro de `tareasDelBorrador` (la ruta no cambia).
   */
  recalculo?: RecalculoEnElCable | null;
}

/* Los motivos van DESPUÉS de «No se pudieron armar las tareas: …» (`textoDeLaLineaDeTareas`): una
   causa corta, en tuteo y en minúscula. Propios y no `MOTIVO_COLGADA` (run-colgada.ts), que es una
   oración entera para el centro de corridas. */
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
  // Cierre de la revisión de E2a: el tope diario de IA decía «la IA no respondió bien».
  if (/presupuesto/.test(t)) return "se agotó el presupuesto de IA del día: avísale a Elías";
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
 * El recálculo guardado, con su estado DEDUCIDO de su corrida (E2c, D6): la misma regla que las tareas
 * (`estadoDeLasTareas` con `listas: false`). «armando» mientras vive; «fallo» si murió, se colgó o
 * terminó sin fusionar entero. El motivo guardado (un fallo parcial) va antes que el de la corrida.
 */
async function recalculoConSuEstado(r: RecalculoDelBorrador, ahora: Date): Promise<RecalculoEnElCable> {
  const corrida = await prisma.agentRun.findUnique({
    where: { id: r.corrida },
    select: { status: true, updatedAt: true, currentPhase: true, output: true },
  });
  const estado = estadoDeLasTareas({ corrida: r.corrida, listas: false }, corrida, ahora) === "armando" ? "armando" : "fallo";
  return {
    estado,
    corrida: r.corrida,
    fases: r.fases.map((f) => f.id),
    nombres: r.fases.map((f) => f.nombre),
    fase: estado === "armando" ? (corrida?.currentPhase ?? null) : null,
    motivo: estado === "fallo" ? (r.motivo ?? motivoDelFallo(corrida)) : null,
  };
}

/**
 * El estado de las tareas del borrador guardado en `pendingProposal`. null = no es un `borrador-v1`
 * o no espera tareas (el handoff, el formato viejo). Solo lee la corrida cuando hace falta: con las
 * tareas listas, o sin corrida, la respuesta sale del JSON. E2c: con un `recalculo` guardado suma su
 * estado (lee SU corrida); sin él, la clave no está.
 */
export async function leerEstadoDeLasTareas(
  guardado: unknown,
  ahora: Date = new Date(),
): Promise<EstadoDeLasTareasDelBorrador | null> {
  if (!esBorradorV1(guardado)) return null;
  const leido = leerBorrador(guardado);
  const tareas = leido?.tareas ?? null;
  if (tareas === null) return null;
  const conRecalculo = leido?.recalculo ? { recalculo: await recalculoConSuEstado(leido.recalculo, ahora) } : {};
  if (tareas.listas || tareas.corrida === null) {
    const estado = estadoDeLasTareas(tareas, null, ahora);
    return estado === null ? null : { estado, fase: null, motivo: null, ...conRecalculo };
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
    ...conRecalculo,
  };
}

/**
 * El borrador VACÍO que espera sus tareas, con el estado REAL de su corrida: «armando» mientras la IA
 * sigue; «fallo» si falló o quedó colgada. null = no es ese borrador. Cierre de la revisión de E2a: el
 * chat lo contaba con un filtro JSON de Prisma que, si la base no lo aceptaba, volvía en silencio al
 * texto de «decidir la propuesta»; y sin mirar la corrida decía «espera» también con la corrida
 * muerta. Se evalúa en JS sobre el JSON leído, con la misma regla que la pantalla (`estadoDelVacio`).
 */
export async function leerEstadoDelVacio(guardado: unknown, ahora: Date = new Date()): Promise<EstadoDelVacio | null> {
  if (!esVacioEsperandoTareas(guardado)) return null;
  return estadoDelVacio(guardado, (await leerEstadoDeLasTareas(guardado, ahora))?.estado ?? null);
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
  /**
   * E2c: recalcular las tareas de las fases desfasadas del borrador abierto (solo con token). `sin`
   * es TODO lo que el CSE desmarcó (las casillas viven en su pantalla hasta E3): con eso el servidor
   * calcula él mismo qué fases están desfasadas.
   */
  recalcular?: { sin: string[] };
}

const esVersion = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
/** Techos de las observaciones del paso 1 que viajan en el pedido (el paso 1 devuelve pocas y cortas). */
const MAX_OBSERVACIONES_DEL_PEDIDO = 20;
const MAX_LARGO_DE_OBSERVACION = 1000;
/** Techos de lo desmarcado que viaja con el recálculo (los mismos que `recalculo.sin` al leerlo). */
const MAX_CLAVES_DEL_RECALCULO = 2000;
const MAX_LARGO_DE_CLAVE = 300;

/** El `recalcular` del pedido: `{ sin }` con sus techos. null = no vale. */
function leerRecalcular(v: unknown): { sin: string[] } | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const { sin } = v as Record<string, unknown>;
  if (!Array.isArray(sin) || sin.length > MAX_CLAVES_DEL_RECALCULO) return null;
  if (!sin.every((k) => typeof k === "string" && k.length >= 1 && k.length <= MAX_LARGO_DE_CLAVE)) return null;
  return { sin: [...(sin as string[])] };
}

/**
 * El `borrador` del body de /analyze, validado. Puro. undefined/null = no es un paso 2 del borrador
 * (las pestañas viejas). Con token, la versión es obligatoria: sin ella no se sabe qué vio el CSE.
 * «Regenerar» de una fase (E2b) también llega por acá, solo con token null: la fase viaja aparte
 * (`regeneratePhaseId`), la marca la guarda en el borrador vacío (`soloFase`) y la fusión la lee de
 * ahí. Con token y una fase, la ruta responde 400 (hasta E3).
 * Con token null acepta `observaciones` (lo que notó el paso 1 sin proponer): el borrador vacío las
 * guarda, así la barra las muestra y sobreviven a recargar o a descartar (revisión de E2a). Con
 * token se ignoran: el borrador del paso 1 ya trae las suyas.
 * E2c: `recalcular` solo con token (se recalcula dentro de un borrador abierto); con token null, o
 * pasado de sus techos, el pedido no vale.
 */
export function leerPedidoDeTareas(raw: unknown): PedidoDeTareas | null | "invalido" {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return "invalido";
  const { token, version, observaciones, recalcular } = raw as Record<string, unknown>;
  const conRecalcular = recalcular !== undefined && recalcular !== null;
  if (token === null) {
    if (conRecalcular) return "invalido";
    if (version !== undefined && version !== null && !esVersion(version)) return "invalido";
    if (observaciones === undefined || observaciones === null) return { token: null, version: null };
    if (!Array.isArray(observaciones) || observaciones.length > MAX_OBSERVACIONES_DEL_PEDIDO) return "invalido";
    if (!observaciones.every((o) => typeof o === "string" && o.length <= MAX_LARGO_DE_OBSERVACION)) return "invalido";
    const limpias = [...new Set((observaciones as string[]).map((o) => o.trim()).filter((o) => o.length > 0))];
    return limpias.length > 0 ? { token: null, version: null, observaciones: limpias } : { token: null, version: null };
  }
  if (typeof token !== "string" || token.length === 0 || token.length > 200) return "invalido";
  if (!esVersion(version)) return "invalido";
  if (!conRecalcular) return { token, version };
  const leido = leerRecalcular(recalcular);
  return leido ? { token, version, recalcular: leido } : "invalido";
}

export type CodigoDelPedido =
  | "PROPUESTA_PENDIENTE"
  | "PROPUESTA_CAMBIO"
  | "TAREAS_EN_CURSO"
  | "NO_SE_PUEDE"
  | "NADA_QUE_RECALCULAR"
  | "ESTRUCTURA_EN_CURSO";
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
/* E2c: el recálculo. Con uno en curso, el 409 reusa `MENSAJE_TAREAS_EN_CURSO`. */
export const MENSAJE_NADA_QUE_RECALCULAR = "No hay tareas que recalcular con lo que marcaste.";
export const MOTIVO_RECALCULO_PERDIDO =
  "Mientras la IA recalculaba las tareas, la propuesta cambió: lo que armó no se guardó.";
/* Por qué una fase del recálculo no se escribe y conserva sus tareas (van después de «No se pudieron
   recalcular las tareas de «X»: …», `textoDelFalloDelRecalculo`). En este orden: el primero que vale
   es el de la fase. */
export const MOTIVO_RECALCULO_EDITADA = "se editó a mano mientras se recalculaban";
export const MOTIVO_RECALCULO_CORTADO = "la respuesta de la IA quedó cortada";
export const MOTIVO_RECALCULO_SIN_TAREAS = "la IA no devolvió sus tareas";
const MOTIVOS_DEL_RECALCULO = [MOTIVO_RECALCULO_EDITADA, MOTIVO_RECALCULO_CORTADO, MOTIVO_RECALCULO_SIN_TAREAS];

/**
 * El motivo guardado de un recálculo que falló en una o más fases. Con una sola causa, la causa (el
 * texto de siempre). Con causas distintas, cada una con SUS fases, en el orden de arriba: «en «Pruebas»,
 * se editó a mano…; en «Diseño», la IA no devolvió sus tareas». Revisión de E2c: unidas con «y» no se
 * sabía cuál había fallado por qué.
 */
export function motivoDelRecalculo(fallas: ReadonlyArray<{ nombre: string; motivo: string }>): string | null {
  const orden = (m: string) => {
    const i = MOTIVOS_DEL_RECALCULO.indexOf(m);
    return i < 0 ? MOTIVOS_DEL_RECALCULO.length : i;
  };
  const motivos = [...new Set(fallas.map((f) => f.motivo))].sort((a, b) => orden(a) - orden(b));
  if (motivos.length === 0) return null;
  if (motivos.length === 1) return motivos[0];
  return motivos.map((m) => `en ${nombresEnTexto(fallas.filter((f) => f.motivo === m).map((f) => f.nombre))}, ${m}`).join("; ");
}

const PENDIENTE: VetoDelPedido = { error: "PROPUESTA_PENDIENTE", message: AVISO_PROPUESTA_PENDIENTE };
const CAMBIO: VetoDelPedido = { error: "PROPUESTA_CAMBIO", message: MENSAJE_PROPUESTA_CAMBIO };
const ESTRUCTURA_EN_CURSO: VetoDelPedido = { error: "ESTRUCTURA_EN_CURSO", message: MENSAJE_ESTRUCTURA_EN_CURSO };

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
  const leido = leerBorrador(guardado);
  if (!leido) return CAMBIO;
  if ((leido.desconocidos ?? 0) > 0) return { error: "NO_SE_PUEDE", message: BLOQUEO_VERSION_NUEVA };
  return null;
}

/**
 * ANTES de crear la corrida (no se paga una que no se va a guardar). Con token null no puede haber
 * ninguna propuesta abierta. Con token: la misma corrida y versión, sin cambios desconocidos, y las
 * tareas en «faltan» o «fallo» (armarlas otra vez mientras se arman, o cuando ya están, no).
 * E2c: con `recalcular`, lo decide `desfasadasDelGuardado` (las tareas «listas», ningún recálculo en
 * curso y alguna fase desfasada con lo que el CSE desmarcó).
 * Revisión de E2b: con token null, tampoco con un paso 1 de este proyecto en curso (otra pestaña u otra
 * persona). El vacío de «Regenerar» de una fase entraba primero y el paso 1, ya pagado, respondía 409
 * sin guardar su propuesta. La misma consulta y la misma ventana que la toma del paso 1, que ya veta el
 * caso contrario (timeline/estructura).
 */
export async function prevalidarPedidoDeTareas(
  timelineId: string,
  pedido: PedidoDeTareas,
  ahora: Date = new Date(),
): Promise<VetoDelPedido | null> {
  if (pedido.recalcular) {
    const r = await desfasadasDelGuardado(timelineId, pedido, pedido.recalcular.sin, ahora);
    return "error" in r ? r : null;
  }
  const tl = await prisma.projectTimeline.findUnique({
    where: { id: timelineId },
    select: { pendingProposal: true, pendingProposalRunId: true, projectId: true },
  });
  if (!tl) return pedido.token === null ? null : CAMBIO;
  const veto = vetoDelGuardado(tl.pendingProposal, tl.pendingProposalRunId, pedido);
  if (veto) return veto;
  if (pedido.token === null) {
    const pasoUnoEnCurso = await prisma.agentRun.findFirst({
      where: {
        projectId: tl.projectId,
        agentSlug: ID_ESTRUCTURA_CRONOGRAMA,
        status: "RUNNING",
        createdAt: { gte: new Date(ahora.getTime() - VENTANA_DEL_PASO_1_EN_CURSO_MS) },
      },
      select: { id: true },
    });
    return pasoUnoEnCurso ? ESTRUCTURA_EN_CURSO : null;
  }
  const estado = (await leerEstadoDeLasTareas(tl.pendingProposal, ahora))?.estado ?? null;
  if (estado === "faltan" || estado === "fallo") return null;
  if (estado === "armando") return { error: "TAREAS_EN_CURSO", message: MENSAJE_TAREAS_EN_CURSO };
  return { error: "NO_SE_PUEDE", message: estado === "listas" ? MENSAJE_TAREAS_YA_LISTAS : MENSAJE_SIN_TAREAS_QUE_ARMAR };
}

/**
 * Con la corrida ya creada, el borrador queda «armando» (su estado se deduce de ESTA corrida).
 *   · token null → nace un borrador vacío, solo si no hay ninguna propuesta (`DbNull`), y su token es
 *     la corrida. El pedido («regenerar» o «primera») sale de las tareas de hoy, con su única fuente,
 *     y lleva lo que notó el paso 1 (`observaciones` del pedido). Con `soloFase` («Regenerar» de una
 *     fase, E2b), el vacío la guarda: de ahí la lee la fusión.
 *   · token → el guardado, con la corrida nueva y la versión + 1, condicionado a token + versión.
 *     `soloFase` se ignora (el alcance es el del guardado).
 *   · E2c, token + `recalcular` → vuelve a calcular las desfasadas (`desfasadasDelGuardado`) y guarda
 *     `recalculo` = { la corrida, esas fases, las claves de ESTRUCTURA de lo desmarcado }, con la
 *     versión + 1 y la misma condición. `tareas` NO se toca (D5: un fallo se leería como «faltan todas»).
 * null = marcado. Si la escritura no entra (otra pestaña, otra persona), no se pisa nada.
 */
export async function marcarTareasEnCurso(i: {
  timelineId: string;
  pedido: PedidoDeTareas;
  corrida: string;
  soloFase?: string | null;
  ahora?: Date;
}): Promise<VetoDelPedido | null> {
  if (i.pedido.recalcular) {
    const r = await desfasadasDelGuardado(i.timelineId, i.pedido, i.pedido.recalcular.sin, i.ahora ?? new Date());
    if ("error" in r) return r;
    const version = i.pedido.version as number;
    // Solo lo desmarcado de la ESTRUCTURA: con eso se rehace la estructura que va a ver el agente.
    const deEstructura = new Set(r.borrador.cambios.filter((c) => !esCambioDeTarea(c)).map((c) => c.clave));
    const recalculo: RecalculoDelBorrador = {
      corrida: i.corrida,
      fases: r.desfasadas.map(({ fase, nombre }) => ({ id: fase, nombre })),
      sin: [...new Set(i.pedido.recalcular.sin.filter((k) => deEstructura.has(k)))],
    };
    const escrita = await prisma.projectTimeline.updateMany({
      where: { id: i.timelineId, pendingProposalRunId: i.pedido.token, pendingProposal: { path: ["version"], equals: version } },
      data: {
        pendingProposal: { ...r.guardado, version: version + 1, recalculo } as unknown as Prisma.InputJsonValue,
      },
    });
    return escrita.count === 0 ? CAMBIO : null;
  }
  if (i.pedido.token === null) {
    const tareas = await prisma.timelineTask.findMany({
      where: { phase: { timelineId: i.timelineId } },
      select: { source: true },
    });
    const vacio = borradorVacio({
      pedido: pedidoDelCronograma(tareas),
      corrida: i.corrida,
      observaciones: i.pedido.observaciones ?? [],
      soloFase: i.soloFase,
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

/**
 * Cómo queda la corrida cuando la marca no entra (otra pestaña u otra persona aplicó, descartó o
 * volvió a pedir entre prevalidar y marcar). Puro. Cierre de la revisión de E2a: no es un fallo —no se
 * llamó a la IA ni se pagó nada, y la pantalla ya lo dice con el 409—, pero en ERROR el centro de
 * corridas lo anunciaba en rojo encima del aviso del cronograma. ARCHIVED no entra al centro de
 * corridas (como el «claim perdido» del watchdog de CS) y el motivo queda escrito, en palabras.
 */
export function cierreDeLaCorridaVetada(veto: VetoDelPedido): { status: "ARCHIVED"; output: string } {
  return { status: "ARCHIVED", output: JSON.stringify({ error: veto.message }) };
}

/** Lo que se lee de cada tarea para el paso 2: lo del plan y «por validar» (las idénticas, R4b). */
const SELECT_DE_TAREA_DEL_DETALLE = { ...SELECT_DE_TAREA, needsValidation: true } as const;
/** Las fases con sus tareas, para `vivoDeLaBase`. E3: la usa también la ruta que edita la propuesta. */
export const SELECT_DE_FASES_CON_TAREAS = {
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

export interface FaseLeida {
  id: string;
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  /** E3: el estado de la fase (`SELECT_DE_FASE` lo trae): una fase que se va choca si ya arrancó. */
  status: string;
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

/** El cronograma de la base como lo ve el núcleo del borrador: fases en orden, CON sus tareas y el estado
 *  de cada fase. E3: la ruta que edita la propuesta lo lee igual (paridad con aplicar y la pantalla). */
export function vivoDeLaBase(anchorStartDate: Date | null, fases: readonly FaseLeida[]): Vivo {
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
      // E3: el mismo dato que la pantalla y que aplicar (paridad: si faltara, la huella diferiría).
      status: f.status,
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

/** Lo que se recalcula: el JSON guardado (se escribe con `{ ...guardado, … }`), su lectura y las fases. */
interface LoQueSeRecalcula {
  guardado: Record<string, unknown>;
  borrador: Borrador;
  desfasadas: FaseDesfasada[];
}

/**
 * E2c: las fases desfasadas del borrador GUARDADO con lo que el CSE desmarcó (`sin`), o por qué no se
 * recalcula. La usan la prevalidación y la marca: las dos deciden con lo mismo.
 *   1. El borrador que el CSE tiene enfrente (`vetoDelGuardado`: su corrida, su versión, sin cambios
 *      desconocidos).
 *   2. Las tareas «listas»: sin ellas no hay nada armado que recalcular.
 *   3. Ningún recálculo «armando» (se deduce de SU corrida): dos corridas pagadas sobre lo mismo, no.
 *   4. Alguna desfasada, con el MISMO plan que la pantalla sobre lo vivo de ahora (con tareas).
 */
async function desfasadasDelGuardado(
  timelineId: string,
  pedido: PedidoDeTareas,
  sin: readonly string[],
  ahora: Date,
): Promise<VetoDelPedido | LoQueSeRecalcula> {
  const tl = await prisma.projectTimeline.findUnique({
    where: { id: timelineId },
    select: {
      pendingProposal: true,
      pendingProposalRunId: true,
      anchorStartDate: true,
      phases: SELECT_DE_FASES_CON_TAREAS,
    },
  });
  if (!tl) return CAMBIO;
  const veto = vetoDelGuardado(tl.pendingProposal, tl.pendingProposalRunId, pedido);
  if (veto) return veto;
  const vivo = vivoDeLaBase(tl.anchorStartDate, tl.phases);
  const borrador = leerBorrador(tl.pendingProposal);
  if (!borrador || !esBorradorV1(tl.pendingProposal)) return CAMBIO;
  if (!borrador.tareas?.listas) return { error: "NO_SE_PUEDE", message: MENSAJE_SIN_TAREAS_QUE_ARMAR };
  if (borrador.recalculo && (await recalculoConSuEstado(borrador.recalculo, ahora)).estado === "armando") {
    return { error: "TAREAS_EN_CURSO", message: MENSAJE_TAREAS_EN_CURSO };
  }
  const { desfasadas } = planDeAplicacion(vivo, borrador, sin, { tareas: "listas" });
  if (desfasadas.length === 0) return { error: "NADA_QUE_RECALCULAR", message: MENSAJE_NADA_QUE_RECALCULAR };
  return { guardado: tl.pendingProposal, borrador, desfasadas };
}

/** La estructura supuesta como la lee el agente: sus fases para el texto, su foto y el alcance. */
function supuestaDe(
  estructura: EstructuraHipotetica,
  closeDateOverride: Date | null,
  soloFases: string[] | null,
): EstructuraSupuesta {
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
      closeDateOverride,
      phases: estructura.fases.map((f) => ({ id: f.id, name: f.name, durationWeeks: f.durationWeeks, startWeek: f.startWeek })),
    },
    estructura,
    ...(soloFases && soloFases.length > 0 ? { soloFases } : {}),
  };
}

/**
 * La estructura SUPUESTA del borrador, para el mensaje del agente (y, en memoria, para la fusión):
 * todo lo que no choca, sin mirar lo que desmarcó el CSE. null = el borrador ya no es el que esta
 * corrida marcó (se aplicó, se descartó o se volvió a pedir): la ruta responde 409 ANTES del modelo.
 * El alcance del prompt (`soloFases`) sale SIEMPRE del JSON guardado (E2b D3): `soloFase` o, en un
 * recálculo (E2c), sus fases. El recálculo ve la estructura CON lo desmarcado (`recalculo.sin`): la
 * que va a quedar.
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
  const borrador = leerBorrador(tl.pendingProposal);
  if (!borrador || (borrador.desconocidos ?? 0) > 0) return null;
  // E2c: esta corrida es el recálculo del borrador (las tareas ya están «listas», de otra corrida).
  if (borrador.recalculo?.corrida === corrida) {
    if (!borrador.tareas?.listas) return null;
    const r = borrador.recalculo;
    return supuestaDe(estructuraHipotetica(vivo, borrador, r.sin), tl.closeDateOverride, r.fases.map((f) => f.id));
  }
  if (borrador.tareas === null || borrador.tareas.listas || borrador.tareas.corrida !== corrida) return null;
  return supuestaDe(estructuraHipotetica(vivo, borrador), tl.closeDateOverride, borrador.soloFase ? [borrador.soloFase] : null);
}

export type ResultadoDeLaFusion =
  | { estado: "listas"; nuevas: number; seVan: number; observaciones: string[] }
  | { estado: "sin-cambios"; observaciones: string[] }
  /** E2c: el recálculo. `fallidas` conservan sus tareas y quedan en `recalculo` con su motivo. */
  | { estado: "recalculadas"; escritas: string[]; fallidas: string[] }
  | { estado: "perdido" };

/**
 * E3: cuántas veces la fusión vuelve a leer y a fusionar cuando su escritura condicionada no entra.
 * Desde E3 otros escriben el borrador mientras la IA arma (las casillas del CSE, la marca de que el chat
 * se abrió): eso sube la versión y la escritura no entra, pero lo armado sigue siendo del mismo borrador.
 */
export const VUELTAS_DE_LA_FUSION = 3;

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

/** Lo que la ruta le pasa a la fusión: la corrida, lo que vio el agente y lo que devolvió. */
interface EntradaDeLaFusion {
  timelineId: string;
  corrida: string;
  estructura: EstructuraHipotetica;
  analysisJson: unknown;
  huellas: HuellasDeFrontera | null;
  cortado: boolean;
  /** Los tests inyectan uno determinista. */
  nuevaClave?: () => string;
}

/** Cómo termina UNA vuelta de la fusión: escrita, perdida (con su motivo) u otra vuelta (no entró). */
type Vuelta =
  | { que: "hecho"; resultado: ResultadoDeLaFusion }
  | { que: "perdido"; motivo: string }
  | { que: "otra-vuelta"; motivo: string };

/**
 * El JSON que escribe una fusión: lo guardado (conserva lo que la fusión no conoce: `excluidos`,
 * `chatAbiertoPara`…) con sus campos. `ajustadasPorElChat` (E3, D9) va solo si queda alguna: una fase
 * que se vuelve a armar pierde la suya.
 */
function conLaFusion(
  guardado: Record<string, unknown>,
  campos: Record<string, unknown>,
  ajustadas: Borrador["ajustadasPorElChat"],
): Prisma.InputJsonValue {
  const { ajustadasPorElChat: _vieja, ...resto } = guardado;
  void _vieja;
  return {
    ...resto,
    ...campos,
    ...(ajustadas && Object.keys(ajustadas).length > 0 ? { ajustadasPorElChat: ajustadas } : {}),
  } as unknown as Prisma.InputJsonValue;
}

/**
 * Lo que armó el agente, fusionado en el borrador que esta corrida marcó. Va DESPUÉS de guardar la
 * salida de la corrida (si la fusión falla, lo armado queda en la corrida).
 *   1. Se lee el borrador, el cronograma CON tareas (el de ahora: dice qué sigue en su fase y qué
 *      tiene avance; el `desde` es lo que LEYÓ el agente, así lo editado mientras tanto choca y queda
 *      fuera, E2b D10) y los tags del proyecto (las fijas de la Semana 0).
 *   2. Perdido: ya no hay un v1, la corrida que lo marcó es otra, las tareas ya están, o hay cambios
 *      desconocidos. La corrida lo dice (`timelineSyncError`) y no se escribe nada.
 *   3. Las tareas se calculan sobre la estructura que VIO el agente (`estructura`, en memoria), con el
 *      alcance del borrador GUARDADO (`soloFase`), nunca el del body.
 *   4. Sin ningún cambio en total, el borrador se borra (condicionado a token + versión); si la IA
 *      notó algo en cualquiera de los dos pasos (lo acordado que no entró, se cortó, fases que no
 *      reconoció), la corrida lo dice.
 *   5. Si no, se guarda con `{ ...guardado, sus campos }`, condicionado a token + versión.
 * E3: si la escritura no entra (las casillas o el chat escribieron el borrador en el medio), se vuelve a
 * leer y a fusionar, hasta `VUELTAS_DE_LA_FUSION` veces: lo armado se pierde solo si el borrador dejó de
 * ser el de esta corrida. Lo que dictó el chat y lo desmarcado se conservan.
 * E2c: si esta corrida es el RECÁLCULO del borrador guardado (`recalculo.corrida`), despacha a
 * `fusionarRecalculoEnElBorrador` ANTES del chequeo de las tareas (que ahí ya están «listas»).
 */
export async function fusionarDetalleEnElBorrador(i: EntradaDeLaFusion): Promise<ResultadoDeLaFusion> {
  let motivo = MOTIVO_TAREAS_PERDIDAS;
  let eraRecalculo = false;
  for (let vuelta = 0; vuelta < VUELTAS_DE_LA_FUSION; vuelta++) {
    const r = await unaVueltaDeLaFusion(i, eraRecalculo);
    if (r.que === "hecho") return r.resultado;
    motivo = r.motivo;
    eraRecalculo = motivo === MOTIVO_RECALCULO_PERDIDO;
    if (r.que === "perdido") break;
  }
  await avisarEnLaCorrida(i.corrida, i.analysisJson, motivo);
  return { estado: "perdido" };
}

/** UNA vuelta: leer, fusionar y escribir condicionado. `eraRecalculo`: la vuelta anterior era el recálculo. */
async function unaVueltaDeLaFusion(i: EntradaDeLaFusion, eraRecalculo: boolean): Promise<Vuelta> {
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
  const perdido = eraRecalculo ? MOTIVO_RECALCULO_PERDIDO : MOTIVO_TAREAS_PERDIDAS;
  if (!tl || !esBorradorV1(tl.pendingProposal)) return { que: "perdido", motivo: perdido };
  const version = versionDelBorrador(tl.pendingProposal);
  const vivo = vivoDeLaBase(tl.anchorStartDate, tl.phases);
  const borrador = leerBorrador(tl.pendingProposal);
  if (borrador?.recalculo?.corrida === i.corrida) {
    return fusionarRecalculoEnElBorrador(i, {
      guardado: tl.pendingProposal,
      token: tl.pendingProposalRunId,
      version,
      vivo,
      borrador,
      tags: sanitizeTags(tl.project?.tags ?? []),
    });
  }
  if (
    eraRecalculo ||
    !borrador ||
    version === null ||
    (borrador.desconocidos ?? 0) > 0 ||
    borrador.tareas === null ||
    borrador.tareas.listas ||
    borrador.tareas.corrida !== i.corrida
  ) {
    return { que: "perdido", motivo: perdido };
  }

  const { propuestas, idsDesconocidos } = tareasPropuestasDelDetalle({
    estructura: i.estructura,
    analysisJson: i.analysisJson,
    huellas: i.huellas,
    cortado: i.cortado,
  });
  // «Regenerar» de una fase (E2b): el alcance sale del JSON guardado, no del pedido.
  const soloFases = borrador.soloFase ? new Set([borrador.soloFase]) : null;
  const cambios = cambiosDeTareasDelDetalle({
    estructura: i.estructura,
    vivo,
    propuestas,
    borrador,
    tags: sanitizeTags(tl.project?.tags ?? []),
    nuevaClave: i.nuevaClave ?? claveAleatoria,
    idsDesconocidos,
    soloFases,
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
    if (borrado.count === 0) return { que: "otra-vuelta", motivo: MOTIVO_TAREAS_PERDIDAS };
    /* Lo que notó la IA en los DOS pasos (`fusionado.observaciones`: las del borrador, que trae lo del
       paso 1, y las del paso 2). Cierre de la revisión de E2a: el aviso llevaba solo las del paso 2, y
       lo del paso 1 se borraba con el borrador sin que nadie lo viera.
       Revisión de E2b: con el desenlace en la primera línea y una observación por línea
       (`avisoSinCambiosParaLaCorrida`). Pegadas, reemplazaban al desenlace en el toast. */
    if (fusionado.observaciones.length > 0) {
      await avisarEnLaCorrida(i.corrida, i.analysisJson, avisoSinCambiosParaLaCorrida(fusionado.observaciones));
    }
    return { que: "hecho", resultado: { estado: "sin-cambios", observaciones: fusionado.observaciones } };
  }

  const escrita = await prisma.projectTimeline.updateMany({
    where: donde,
    data: {
      pendingProposal: conLaFusion(
        tl.pendingProposal as Record<string, unknown>,
        {
          version: fusionado.version,
          observaciones: fusionado.observaciones,
          cambios: fusionado.cambios,
          tareas: fusionado.tareas,
          tareasArmadasPara: fusionado.tareasArmadasPara,
        },
        fusionado.ajustadasPorElChat,
      ),
    },
  });
  if (escrita.count === 0) return { que: "otra-vuelta", motivo: MOTIVO_TAREAS_PERDIDAS };
  return {
    que: "hecho",
    resultado: {
      estado: "listas",
      nuevas: fusionado.cambios.filter((c) => c.tipo === "tarea-nueva" && !c.porChat).length,
      seVan: fusionado.cambios.filter((c) => c.tipo === "tarea-se-va" && !c.porChat).length,
      observaciones: cambios.observaciones,
    },
  };
}

/**
 * E2c: lo que armó el RECÁLCULO, fusionado en el borrador (una vuelta). Solo cambian las tareas de las
 * fases que se pidieron (`recalculo.fases`), en su mismo lugar de la lista; lo demás no se toca. NUNCA
 * borra.
 *   1. Perdido: sin versión, cambios desconocidos, las tareas que no están «listas» o el recálculo
 *      guardado es de otra corrida. La corrida lo dice y no se escribe nada.
 *   2. Una fase FALLA, conserva sus tareas y queda en `recalculo` con el motivo (D6, D11), si:
 *      su forma ya no es la que vio el agente (se editó a mano mientras corría: lo vivo de ahora con lo
 *      desmarcado al pedirlo), la salida se cortó en ella, o el agente no le devolvió tareas.
 *   3. Las demás se ESCRIBEN: sus tareas con las reglas de siempre (`cambiosDeTareasDelDetalle`, con
 *      su alcance), y su forma armada. El tipo propuesto se ignora: es de estructura y se decidió en la
 *      primera fusión.
 *   4. Condicionada a token + la versión leída AHORA; si no entra, otra vuelta (E3: las casillas o el
 *      chat escribieron en el medio), con lo que haya entonces.
 */
async function fusionarRecalculoEnElBorrador(
  i: EntradaDeLaFusion,
  leido: {
    guardado: Record<string, unknown>;
    token: string | null;
    version: number | null;
    vivo: Vivo;
    borrador: Borrador;
    tags: string[];
  },
): Promise<Vuelta> {
  const { borrador, version, vivo } = leido;
  const recalculo = borrador.recalculo;
  if (
    version === null ||
    (borrador.desconocidos ?? 0) > 0 ||
    !borrador.tareas?.listas ||
    !recalculo ||
    recalculo.corrida !== i.corrida
  ) {
    return { que: "perdido", motivo: MOTIVO_RECALCULO_PERDIDO };
  }

  const { propuestas, idsDesconocidos } = tareasPropuestasDelDetalle({
    estructura: i.estructura,
    analysisJson: i.analysisJson,
    huellas: i.huellas,
    cortado: i.cortado,
  });
  const propuestaDe = new Map(propuestas.map((p) => [p.fase, p]));
  // La estructura de AHORA con lo que el CSE había desmarcado al pedirlo: si la fase cambió, no calza.
  const ahora = estructuraHipotetica(vivo, borrador, recalculo.sin);
  const motivoDe = (fase: string): string | null => {
    if (!mismaForma(formaEnLaEstructura(i.estructura, fase), formaEnLaEstructura(ahora, fase))) return MOTIVO_RECALCULO_EDITADA;
    const p = propuestaDe.get(fase);
    if (p?.cortada) return MOTIVO_RECALCULO_CORTADO;
    if (!p || p.delAgente.length === 0) return MOTIVO_RECALCULO_SIN_TAREAS;
    return null;
  };
  const escritas: string[] = [];
  const fallidas: Array<{ id: string; nombre: string }> = [];
  const fallas: Array<{ nombre: string; motivo: string }> = [];
  for (const f of recalculo.fases) {
    const motivo = motivoDe(f.id);
    if (motivo === null) {
      escritas.push(f.id);
    } else {
      fallidas.push(f);
      fallas.push({ nombre: f.nombre, motivo });
    }
  }

  const cambios = cambiosDeTareasDelDetalle({
    estructura: i.estructura,
    vivo,
    propuestas,
    borrador,
    tags: leido.tags,
    nuevaClave: i.nuevaClave ?? claveAleatoria,
    idsDesconocidos,
    soloFases: new Set(escritas),
  });
  const nuevo = fusionarRecalculo(borrador, {
    tareas: cambios.tareas,
    armadas: cambios.tareasArmadasPara,
    escritas,
    fallidas,
    // Un solo texto por recálculo: con causas distintas, cada una con sus fases (`motivoDelRecalculo`).
    motivo: motivoDelRecalculo(fallas),
    observaciones: cambios.observaciones,
  });

  const escrita = await prisma.projectTimeline.updateMany({
    where: { id: i.timelineId, pendingProposalRunId: leido.token, pendingProposal: { path: ["version"], equals: version } },
    data: {
      pendingProposal: conLaFusion(
        leido.guardado,
        {
          version: nuevo.version,
          observaciones: nuevo.observaciones,
          cambios: nuevo.cambios,
          tareasArmadasPara: nuevo.tareasArmadasPara,
          recalculo: nuevo.recalculo ?? null,
        },
        nuevo.ajustadasPorElChat,
      ),
    },
  });
  if (escrita.count === 0) return { que: "otra-vuelta", motivo: MOTIVO_RECALCULO_PERDIDO };
  return { que: "hecho", resultado: { estado: "recalculadas", escritas, fallidas: fallidas.map((f) => f.id) } };
}
