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
 *                                 Rotulado como la BASE de los cambios, no «solo lectura».
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
 * este paso propone cambios justamente sobre él. "" sin fases.
 */
export function calendarioDeEstructura(foto: FotoDelCronograma | null | undefined, ahora: number): string {
  return calendarioDelCronograma(foto, ahora, { conIds: true, conEstado: true, conHoy: true, comoBaseDeCambios: true });
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
 * ¿Hay algo que revisar? Solo reuniones elegidas CON contenido o notas con texto. Sin esto la ruta
 * vuelve ANTES de crear la corrida y de llamar al modelo: el «Regenerar todo» de un proyecto sin
 * material queda exactamente como antes, sin costo extra.
 */
export function tieneMaterialDelCronograma(fuentes: readonly FuenteDeContexto[]): boolean {
  return fuentes.some(
    (f) => (FUENTES_DE_MATERIAL as readonly string[]).includes(f.key) && f.texto.trim().length > 0,
  );
}

/** La regla que viaja SIEMPRE con el contexto (va después de las fuentes). */
export const REGLA_DE_FRONTERA_DE_ESTRUCTURA =
  "⛔ FRONTERA — el contexto de arriba es INTERNO; el nombre de una fase lo LEE EL CLIENTE en cuanto " +
  `el CSE acepta el cambio. ${FRONTERA_DEL_MATERIAL} El «motivo» y las «observaciones» son internos: ` +
  "ahí sí cita la reunión (título y fecha) o la nota.";

const PEDIDO_DE_ESTRUCTURA =
  "Revisa si lo que eligió el CSE obliga a cambiar las fases o los tiempos del calendario de arriba. " +
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
