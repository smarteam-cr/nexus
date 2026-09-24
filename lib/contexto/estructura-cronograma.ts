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
 *                                 LARGO DEL PLAN en números (para comparar un plazo total sin leer
 *                                 al revés la resta).
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
  type FotoDelCronograma,
} from "./material-cronograma";
import { timelineSpan } from "@/lib/timeline/weeks";
import {
  PLANTILLA_PLAZO_CON_MARGEN,
  PLANTILLA_PLAZO_EXCEDIDO,
  faseDeSemanaCero,
} from "@/lib/timeline/propuesta-de-estructura";

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
 * este paso propone cambios justamente sobre él. Al final, el LARGO DEL PLAN en números
 * (`lineaDelLargoDelPlan`). "" sin fases.
 */
export function calendarioDeEstructura(
  foto: FotoDelCronograma | null | undefined,
  ahora: number,
  opts: { conSemanaCero?: boolean } = {},
): string {
  const cal = calendarioDelCronograma(foto, ahora, { conIds: true, conEstado: true, conHoy: true, comoBaseDeCambios: true });
  if (!cal) return cal;
  const lineas = [cal, lineaDeLaSemanaCero(foto, opts.conSemanaCero), lineaDelLargoDelPlan(foto)];
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
 * ⭐ EL LARGO DEL PLAN, EN NÚMEROS, Y HACIA DÓNDE VA UN PLAZO (revisión del paso A3). Con el plan en
 * 15 semanas y un plazo de 12, el revisor escribió «3 semanas de holgura» en las 3 corridas de E3:
 * tenía el número y leyó al revés la resta. Esta línea le da la cifra a comparar y la cuenta hecha
 * con las MISMAS frases que el prompt obliga a usar (lib/timeline/propuesta-de-estructura.ts). ""
 * sin fases.
 */
export function lineaDelLargoDelPlan(foto: FotoDelCronograma | null | undefined): string {
  const n = largoDelPlanEnSemanas(foto);
  if (!n) return "";
  return (
    `⭐ LARGO DEL PLAN HOY (sin los cambios que propongas): ${n} ${n === 1 ? "semana" : "semanas"}, de la ` +
    `semana 1 a la semana ${n} del proyecto. Un plazo total acordado de M semanas se compara contra ${n}: si ` +
    `M es menor que ${n}, ${PLANTILLA_PLAZO_EXCEDIDO.replace("N", `${n} − M`)}; si M es mayor que ${n}, ` +
    `${PLANTILLA_PLAZO_CON_MARGEN.replace("N", `M − ${n}`)}.`
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
