/**
 * lib/contexto/estructura-cronograma.ts — EL CONTEXTO DEL REVISOR DE FASES Y TIEMPOS. Puro, sin
 * Prisma. Lo carga `cargarContextoDeEstructura` (./cargar.ts) y lo manda la ruta
 * `timeline/estructura` (paso 1 de «Regenerar todo»; el prompt vive en
 * lib/agents/estructura-cronograma.ts).
 *
 * Qué ve el revisor, y nada más:
 *   · calendario-del-cronograma — EL calendario del plan (`calendarioDelCronograma`, el mismo de
 *                                 todos los agentes) con las tres opciones: ids (para nombrar la
 *                                 fase que cambia), estado y tareas hechas (para no tocar lo
 *                                 terminado ni acortar trabajo empezado) y «Hoy» (para no mover
 *                                 nada al pasado). Semanas del proyecto desde 1, como el Gantt.
 *                                 Rotulado como la BASE de los cambios, no «solo lectura»; dice
 *                                 cuál es la Semana 0 (o que el proyecto no tiene) y cierra con el
 *                                 CIERRE ACTUAL en números (el fijado a mano, o hoy si el planificado
 *                                 ya pasó) y cómo pasar un plazo total a su semana. La comparación
 *                                 la escribe el sistema, no el modelo (`fraseDelPlazo`).
 *   · instrucciones             — el brief `__doc`; con él solo, la revisión igual corre.
 *   · handoff-curado            — solo bloques confirmados, con un respaldo PROPIO sin handoff.
 *   · reuniones / notas         — lo que el CSE eligió, con los rótulos del motor del material.
 *   · instrucciones             — el brief `__doc` del canvas del cronograma (manda sobre todo).
 *
 * ⛔ NO reusa `fuentesDelDetalle`: el rótulo del detalle dice «no cambies nombres, duraciones ni
 * orden» y «CRONOGRAMA A DETALLAR», que es exactamente lo contrario de lo que este paso hace.
 * Tampoco trae el requerimiento técnico: decide fases y tiempos, no objetos ni llaves.
 *
 * La FRONTERA es la del material (`FRONTERA_DEL_MATERIAL`, una sola constante para todos los
 * agentes que escriben lo que lee el cliente): el nombre de una fase nueva o renombrada lo lee el
 * cliente en cuanto se acepta.
 */
import { renderFuentes, type FuenteDeContexto } from "./tipos";
import {
  FRONTERA_DEL_MATERIAL,
  calendarioDelCronograma,
  diaEnCostaRica,
  type FotoDelCronograma,
} from "./material-cronograma";
import { timelineSpan } from "@/lib/timeline/weeks";
import { faseDeSemanaCero } from "@/lib/timeline/propuesta-de-estructura";

/** El respaldo sin handoff. ⚠ No es SIN_HANDOFF_CONFIRMADO: este paso SIEMPRE tiene material. */
export const SIN_HANDOFF_PARA_ESTRUCTURA = "(Sin handoff confirmado: apóyate solo en lo que eligió el CSE.)";

/** Las fuentes que cuentan como material del «Contexto del cronograma». */
const FUENTES_DE_MATERIAL = ["reuniones-del-cronograma", "notas-del-cronograma"] as const;

/** Una fase del cronograma tal como la lee la ruta (el select de Prisma). */
export interface FaseDelPlanParaEstructura {
  id: string;
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  status: string | null;
  tasks: ReadonlyArray<{ status: string }>;
}

/**
 * LA FOTO que ven el modelo y el armador: la ruta la arma UNA vez con lo que leyó, y se la pasa al
 * cargador del material (`opts.fases`) — si cada uno leyera por su lado, el modelo podría nombrar
 * una fase que el armador ya no tiene. Fases EN ORDEN.
 */
export function fotoDeEstructura(tl: {
  anchorStartDate: Date | string | null;
  closeDateOverride?: Date | string | null;
  phases: readonly FaseDelPlanParaEstructura[];
}): FotoDelCronograma {
  return {
    anchorStartDate: tl.anchorStartDate,
    closeDateOverride: tl.closeDateOverride ?? null,
    phases: tl.phases.map((f) => ({
      id: f.id,
      name: f.name,
      durationWeeks: f.durationWeeks,
      startWeek: f.startWeek,
      status: f.status,
      hechas: f.tasks.filter((t) => t.status === "DONE").length,
      total: f.tasks.length,
    })),
  };
}

/**
 * EL calendario, con las tres opciones —ids, estado y «Hoy»— y rotulado como la BASE de los cambios
 * (`comoBaseDeCambios`): el de los demás agentes dice «solo lectura… úsalo SOLO para ubicar», y
 * este paso propone cambios justamente sobre él. Al final, el CIERRE ACTUAL en números
 * (`lineaDelCierreActual`). "" sin fases.
 */
export function calendarioDeEstructura(
  foto: FotoDelCronograma | null | undefined,
  ahora: number,
  opts: { conSemanaCero?: boolean } = {},
): string {
  const cal = calendarioDelCronograma(foto, ahora, { conIds: true, conEstado: true, conHoy: true, comoBaseDeCambios: true });
  if (!cal) return cal;
  const lineas = [cal, lineaDeLaSemanaCero(foto, opts.conSemanaCero), lineaDelCierreActual(foto, ahora)];
  return lineas.filter(Boolean).join("\n");
}

/**
 * CUÁL ES LA SEMANA 0, o que no hay (revisión adversarial, 2026-09-24). El prompt prohíbe tocar «la
 * Semana 0 / Kick-off», pero el calendario no decía cuál era: en Desarrollo y Web —que no tienen— el
 * modelo proponía cambios sobre su primera fase y el armador los descartaba por «Semana 0». La MISMA
 * regla que el armador (`faseDeSemanaCero`). "" si quien llama no sabe si el proyecto tiene Semana 0.
 */
export function lineaDeLaSemanaCero(foto: FotoDelCronograma | null | undefined, conSemanaCero: boolean | undefined): string {
  if (conSemanaCero === undefined) return "";
  const fases = (foto?.phases ?? []).filter((f): f is typeof f & { id: string } => !!f.id);
  if (fases.length === 0) return "";
  const s0 = faseDeSemanaCero(fases, conSemanaCero);
  return s0
    ? `Semana 0 / Kick-off de este proyecto: «${s0.name}» [id: ${s0.id}]. No se toca: si el material pide cambiarla, va a "observaciones".`
    : `Este proyecto NO tiene Semana 0 / Kick-off: su primera fase («${fases[0].name}») es trabajo como cualquier otra y se ajusta si el material lo pide.`;
}

/**
 * Cuántas semanas de calendario ocupa el plan HOY (la última semana ocupada; con fases en
 * paralelo es menos que la suma de las duraciones), con la misma fórmula del Gantt. null sin fases.
 */
export function largoDelPlanEnSemanas(foto: FotoDelCronograma | null | undefined): number | null {
  const fases = foto?.phases ?? [];
  if (fases.length === 0) return null;
  return timelineSpan(fases.map((f) => ({ durationWeeks: f.durationWeeks, startWeek: f.startWeek ?? null })));
}

/**
 * ⭐ EL CIERRE ACTUAL, EN SEMANAS DEL PROYECTO (revisión adversarial, 2026-09-24). La decisión de
 * negocio es comparar el cierre ACTUAL contra el plazo acordado. La primera versión (paso A3)
 * comparaba contra el largo de las fases, y eso no es el cierre que ve el CSE:
 *  · con un cierre FIJADO A MANO (Tanda K) —el que muestran el chip, el chat y el cliente—, las fases
 *    podían terminar en la 12 y el cierre visible en la 15: con un plazo de 13 el revisor escribía
 *    «queda 1 semana de margen» cuando el cierre visible se pasaba 2;
 *  · con el proyecto ATRASADO —hoy ya pasó el cierre planificado y quedan fases sin terminar, el caso
 *    común a media ejecución—, el plan no cierra antes de hoy, aunque las fases digan otra cosa.
 * `semana` es la semana del proyecto (desde 1) en que el plan cierra hoy. null sin fases.
 */
export interface CierreActual {
  semana: number;
  /** De dónde sale: el fin de las fases, el cierre fijado a mano, u hoy (el planificado ya pasó). */
  porque: "fases" | "fijado" | "vencido";
  /** El fin de las fases (la última semana ocupada). */
  semanasDeLasFases: number;
  /** El cierre sin mirar hoy: el fijado a mano, o el fin de las fases. */
  planificado: number;
  /** La semana de hoy (desde 1), o null sin ancla. */
  semanaDeHoy: number | null;
}

const SEMANA_MS = 7 * 86_400_000;

/** El día de una fecha GUARDADA COMO DÍA (el ancla, el cierre fijado), como medianoche UTC. */
function diaGuardado(fecha: Date | string | null | undefined): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function cierreActualDelPlan(foto: FotoDelCronograma | null | undefined, ahora: number): CierreActual | null {
  const n = largoDelPlanEnSemanas(foto);
  if (!n) return null;
  const ancla = diaGuardado(foto?.anchorStartDate);
  // «Hoy» con la MISMA cuenta que la línea «Hoy:» del calendario (el día en Costa Rica).
  const semanaDeHoy = ancla === null ? null : Math.floor((diaEnCostaRica(ahora) - ancla) / SEMANA_MS) + 1;
  const fijado = diaGuardado(foto?.closeDateOverride);
  const conFijado = ancla !== null && fijado !== null;
  // El cierre fijado cae en la semana que lo contiene: el fin de las fases (ancla + n semanas) da n.
  const planificado = conFijado ? Math.max(1, Math.ceil((fijado - ancla) / SEMANA_MS)) : n;
  const quedanFases = (foto?.phases ?? []).some((f) => f.status !== "DONE" && f.status !== "SUSPENDED");
  if (semanaDeHoy !== null && quedanFases && semanaDeHoy > planificado) {
    return { semana: semanaDeHoy, porque: "vencido", semanasDeLasFases: n, planificado, semanaDeHoy };
  }
  return { semana: planificado, porque: conFijado ? "fijado" : "fases", semanasDeLasFases: n, planificado, semanaDeHoy };
}

/**
 * La línea del calendario del revisor: el CIERRE ACTUAL (`cierreActualDelPlan`) y cómo pasar un plazo
 * total acordado a M, la semana del proyecto en que vence, para devolverlo en `plazoTotal`.
 *
 * ⛔ SIN LA COMPARACIÓN (medido en vivo 2026-09-24: el modelo invertía la dirección 6 de 6; la cuenta
 * pasa al código). Esta línea explicaba la resta («si M es menor que 15, el plan se pasa 15 − M…») y
 * aun así el modelo escribía «quedan 3 semanas de margen» con el plan 3 semanas pasado. Ahora la
 * comparación la escribe `fraseDelPlazo` (lib/timeline/propuesta-de-estructura.ts) contra ESTE mismo
 * cierre: la ruta le pasa al armador `cierreActualDelPlan` con la misma foto y el mismo `ahora`.
 *
 * Una DURACIÓN del proyecto («son 12 semanas») se cuenta desde el arranque: M es ese número, sin
 * sumarle nada (sin decirlo, 6 de 12 corridas le sumaron la semana de hoy). Solo un plazo contado
 * DESDE HOY («nos quedan 6 semanas») suma la semana de hoy: con la fórmula literal, M = 6 en la semana
 * 10 daba «el plan se pasa 9 semanas» cuando quedaba 1 de margen (revisión adversarial, 2026-09-24).
 * "" sin fases.
 */
export function lineaDelCierreActual(foto: FotoDelCronograma | null | undefined, ahora: number): string {
  const c = cierreActualDelPlan(foto, ahora);
  if (!c) return "";
  const N = c.semana;
  const porque =
    c.porque === "fases"
      ? `el fin de las fases, de la semana 1 a la semana ${N}`
      : c.porque === "fijado"
        ? `el cierre fijado a mano, que es el que ve el CSE (las fases terminan en la semana ${c.semanasDeLasFases})`
        : `hoy: el cierre planificado (semana ${c.planificado}) ya pasó y quedan fases sin terminar, así que el ` +
          `proyecto cierra esta semana o después`;
  const hoy = c.semanaDeHoy !== null ? ` Hoy es la semana ${c.semanaDeHoy} del proyecto.` : "";
  const desdeHoy =
    c.semanaDeHoy !== null
      ? `solo si se cuenta desde HOY («nos quedan 6 semanas», «en dos meses más»), súmale la semana de hoy: M = ${c.semanaDeHoy} + lo que dice`
      : `si se cuenta desde hoy, sin fecha de arranque no se puede ubicar: "plazoTotal": null, y anótalo en "observaciones" sin comparar`;
  return (
    `⭐ CIERRE ACTUAL (sin los cambios que propongas): semana ${N} del proyecto — ${porque}.${hoy} ` +
    `Un plazo total acordado se devuelve en "plazoTotal" como M, la semana del proyecto en que vence (la ` +
    `comparación con este cierre la hace el sistema): si dice cuánto dura el proyecto («son 12 semanas», «una ` +
    `duración de 12 semanas»), se cuenta desde el arranque: M es ese número, sin sumarle nada; ${desdeHoy}; si ` +
    `es una fecha, M es la semana del proyecto en que cae.`
  );
}

export interface CrudasDeEstructura {
  /** De `calendarioDeEstructura`. */
  calendarioCtx: string;
  /** Handoff, SOLO bloques confirmados. "" si no hay. */
  handoffCtx: string;
  /** Los bloques del motor del material, ya rotulados. "" si no hay. */
  reunionesCtx?: string;
  notasCtx?: string;
}

export function fuentesDeEstructura(c: CrudasDeEstructura): FuenteDeContexto[] {
  return [
    { key: "calendario-del-cronograma", ambito: "proyecto", texto: c.calendarioCtx.trim() ? c.calendarioCtx : "" },
    {
      key: "handoff-curado",
      ambito: "proyecto",
      texto: `=== QUÉ SE VENDIÓ (handoff, bloques confirmados por el CSE) ===\n${c.handoffCtx.trim() || SIN_HANDOFF_PARA_ESTRUCTURA}`,
    },
    ...(c.reunionesCtx?.trim()
      ? [{ key: "reuniones-del-cronograma", ambito: "proyecto" as const, texto: c.reunionesCtx }]
      : []),
    ...(c.notasCtx?.trim() ? [{ key: "notas-del-cronograma", ambito: "proyecto" as const, texto: c.notasCtx }] : []),
  ];
}

/**
 * ¿Hay material elegido? Solo reuniones elegidas CON contenido o notas con texto.
 */
export function tieneMaterialDelCronograma(fuentes: readonly FuenteDeContexto[]): boolean {
  return fuentes.some(
    (f) => (FUENTES_DE_MATERIAL as readonly string[]).includes(f.key) && f.texto.trim().length > 0,
  );
}

/**
 * ¿Hay algo que revisar? Material elegido (reuniones con contenido o notas) o «Instrucciones
 * adicionales». Sin nada de eso la ruta vuelve ANTES de crear la corrida y de llamar al modelo: el
 * «Regenerar todo» de un proyecto sin material ni instrucciones queda como antes, sin costo extra.
 *
 * ⭐ Las instrucciones solas TAMBIÉN (revisión adversarial, 2026-09-24): son la fuente de más peso,
 * viven dentro del «Contexto del cronograma» debajo del texto que promete revisar fases y tiempos, y
 * un «Capacitación dura 3 semanas, no 2» escrito ahí no movía ninguna fase: el paso 1 no corría y el
 * detalle tiene prohibido tocarlas. Mismo criterio que la pantalla (`hayMaterialParaElPaso1`).
 */
export function hayQueRevisarLasFases(contexto: {
  fuentes: readonly FuenteDeContexto[];
  instrucciones: string;
}): boolean {
  return tieneMaterialDelCronograma(contexto.fuentes) || contexto.instrucciones.trim().length > 0;
}

/** La regla que viaja SIEMPRE con el contexto (va después de las fuentes). */
export const REGLA_DE_FRONTERA_DE_ESTRUCTURA =
  "⛔ FRONTERA — el contexto de arriba es INTERNO; el nombre de una fase lo LEE EL CLIENTE en cuanto " +
  `el CSE acepta el cambio. ${FRONTERA_DEL_MATERIAL} El «motivo» y las «observaciones» son internos: ` +
  "ahí sí cita la reunión (título y fecha), la nota o las instrucciones del CSE.";

const PEDIDO_DE_ESTRUCTURA =
  "Revisa si lo que eligió y escribió el CSE (reuniones, notas e instrucciones) obliga a cambiar las fases o los tiempos del calendario de arriba. " +
  'Devuelve SOLO el JSON del formato indicado, sin texto antes ni después; si nada cambia, "cambios": [].';

/**
 * El mensaje completo: instrucciones del CSE + fuentes + frontera + el pedido. La ruta no arma
 * ningún bloque `=== … ===` a mano (lo vigila lib/contexto/estructura-cronograma.test.ts).
 */
export function renderEstructuraDelCronograma(i: {
  instrucciones: string;
  fuentes: readonly FuenteDeContexto[];
}): string {
  return `${i.instrucciones}${renderFuentes(i.fuentes)}\n\n${REGLA_DE_FRONTERA_DE_ESTRUCTURA}\n\n${PEDIDO_DE_ESTRUCTURA}`;
}
