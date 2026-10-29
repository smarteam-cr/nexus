/**
 * lib/exploraciones/punto-de-partida.ts — LO MEDIDO EN LA PREVENTA ES EL PUNTO DE PARTIDA DE LA CUENTA. PURO.
 *
 * Escala única (2026-10-28, pedido de Elías): la escala de un cliente (La cuenta › La escala) es la misma pieza que la
 * de la preventa, sobre la exploración de «Información del cliente». La primera vez que se abre —o si ya existía sin
 * haber medido nunca nada— parte de lo que midió la preventa: la edición y el perfil (con quién los eligió), las áreas en
 * juego, el nivel de cada dimensión con su frase y su porqué, y lo que pide Funcional. Lo que el agente propuso en la
 * preventa y nadie usó NO viaja: no midió nada.
 *
 * Sale en DOS tandas, porque el escritor (`aplicarCambios`) valida los criterios contra la edición que la exploración
 * tiene en ese momento y una sola operación que no corresponde tumba la tanda entera:
 *   1. `escalaDeLaPreventa`: la edición y el perfil, si la edición sigue publicada.
 *   2. `medidoDeLaPreventa`: con la escala que la cuenta tiene DESPUÉS de la tanda 1, solo lo que existe en ella. Un
 *      criterio de otra edición (marcado antes de cambiarla en la preventa) o una dimensión que la escala ya no trae se
 *      quedan afuera y se cuentan, para avisarlo.
 * Una cuenta que ya tiene algún nivel no se toca: lo que se midió en ella manda.
 *
 * DE DÓNDE (2026-10-29, revisión de lo juntado): no solo de la preventa. Un cliente sin preventa cuyo CSE confirmó niveles
 * en la Exploración de su proyecto también tiene un punto de partida (`origenDelPuntoDePartida`): la exploración de la
 * empresa que midió algo más recientemente, la preventa o la de un proyecto, UNA sola (nunca se mezclan dos).
 */
import type { EstadoDeExploracion, Operacion } from "./contenido";

type Estado = Pick<EstadoDeExploracion, "contenido" | "areas" | "edicion" | "perfilCierre" | "perfilDespues">;

/** Lo que existe en la escala con que se mide la cuenta (ids de la escala del lienzo). */
export interface LoQueExiste {
  dimensiones: ReadonlySet<string>;
  criterios: ReadonlySet<string>;
  areas: ReadonlySet<string>;
}

/** Una exploración de la empresa que puede dar el punto de partida (la preventa o la de un proyecto, nunca la cuenta). */
export interface CandidataDePartida<E extends Estado = Estado> {
  id: string;
  /** «la preventa» o «la Exploración de «Implementación»», para el aviso. */
  desde: string;
  /** Cuándo midió algo por última vez (la fecha de su última versión). */
  actualizada: Date;
  estado: E;
}

/** La que midió algo más recientemente; null si ninguna midió nada. */
export function origenDelPuntoDePartida<E extends Estado>(candidatas: readonly CandidataDePartida<E>[]): CandidataDePartida<E> | null {
  return [...candidatas].filter((c) => midioAlgo(c.estado)).sort((a, b) => b.actualizada.getTime() - a.actualizada.getTime())[0] ?? null;
}

/** ¿La exploración midió algo? (un nivel en alguna dimensión). */
export const midioAlgo = (e: Pick<EstadoDeExploracion, "contenido">): boolean => Object.keys(e.contenido.chequeo).length > 0;

/** ¿Hay algo que traer? Solo si la preventa midió y la cuenta todavía no. */
export const hayQueTraer = (preventa: Estado, cuenta: Estado): boolean => midioAlgo(preventa) && !midioAlgo(cuenta);

/**
 * Tanda 1: la edición y el perfil de la preventa. Vacía si ya se mide igual o si la edición de la preventa ya no está
 * publicada (`ediciones`): en ese caso la cuenta sigue con la suya.
 */
export function escalaDeLaPreventa(preventa: Estado, cuenta: Estado, ediciones: ReadonlySet<string>): Operacion[] {
  const mismaEscala = preventa.edicion === cuenta.edicion && preventa.perfilCierre === cuenta.perfilCierre && preventa.perfilDespues === cuenta.perfilDespues;
  if (mismaEscala || (preventa.edicion !== null && !ediciones.has(preventa.edicion))) return [];
  const elegida = preventa.contenido.edicionElegida;
  if (elegida && elegida.por !== "vendedor") {
    // La eligió el agente o la industria: sigue siendo automática, con la razón de la preventa.
    return [
      {
        op: "restablecerEscala",
        sugerida: { edicion: preventa.edicion, cierre: preventa.perfilCierre, despues: preventa.perfilDespues, por: elegida.por, razon: elegida.razon ?? "Se mide como en la preventa." },
      },
    ];
  }
  // La eligió una persona (o es de antes de que se anotara quién): sigue elegida a mano. La edición trae su perfil
  // habitual; el de la preventa va después y gana.
  const ops: Operacion[] = [{ op: "edicion", edicion: preventa.edicion }];
  if (preventa.perfilCierre && preventa.perfilDespues) ops.push({ op: "perfil", cierre: preventa.perfilCierre, despues: preventa.perfilDespues });
  return ops;
}

export interface LoMedido {
  ops: Operacion[];
  /** Cuántas dimensiones trae. */
  dimensiones: number;
  /** Cuántas cosas medidas no existen en la escala de la cuenta y se quedaron afuera. */
  afuera: number;
}

/** Tanda 2: las áreas, los niveles y lo que pide Funcional que existen en la escala de la cuenta (`existe`). */
export function medidoDeLaPreventa(preventa: Estado, cuenta: Estado, existe: LoQueExiste): LoMedido {
  const ops: Operacion[] = [];
  let afuera = 0;
  // Las áreas de la preventa primero (su orden es el de «qué va primero»), después las que la cuenta ya tenía.
  const areas = [...new Set([...preventa.areas, ...cuenta.areas])].filter((a) => existe.areas.has(a));
  if (areas.join("|") !== cuenta.areas.join("|")) ops.push({ op: "areas", areas });
  let dimensiones = 0;
  for (const [dimensionId, estimado] of Object.entries(preventa.contenido.chequeo)) {
    if (!existe.dimensiones.has(dimensionId)) {
      afuera += 1;
      continue;
    }
    ops.push({ op: "nivel", dimensionId, estimado: { ...estimado } });
    dimensiones += 1;
  }
  for (const [criterioId, estado] of Object.entries(preventa.contenido.falta)) {
    if (cuenta.contenido.falta[criterioId]) continue;
    if (!existe.criterios.has(criterioId)) {
      afuera += 1;
      continue;
    }
    ops.push({ op: "falta", criterioId, estado: { ...estado } });
  }
  return { ops, dimensiones, afuera };
}
