/**
 * lib/exploraciones/forma-de-la-respuesta.ts — la forma de una respuesta de «Responder con Nexus» en una nota: «Sobre
 * <equipo> · <parte> (<la pregunta>): <la respuesta>». PURO, client-safe y SIN imports, a propósito.
 *
 * Salió de completar-el-diagnostico.ts el 25 nov: el pedido de «Ubicar» (agente-pedido.ts) necesita esta forma, y
 * con agente-pedido.ts importando completar-el-diagnostico.ts el build de producción (Turbopack, Next 16.1.6) se caía
 * con «Dependency tracking is disabled so invalidation is not allowed». Con este módulo sin imports, compila. Ver
 * docs/KNOWN-ERRORS.md. completar-el-diagnostico.ts lo reexporta: sus importadores no cambian.
 */

/** Una pregunta de La escala que se responde con Nexus. */
export interface PreguntaParaResponder {
  /** «Ventas», «Marketing»… */
  equipo: string;
  /** El nombre de la parte: «Datos», «Procesos»… */
  dimension: string;
  dimensionId: string;
  /** La pregunta, como se ve en la pantalla. */
  pregunta: string;
}

/** La pregunta sin sus signos ni el punto final, para ir entre paréntesis. */
function sinSignos(pregunta: string): string {
  return pregunta
    .replace(/[¿?]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:,]+$/, "");
}

const PALABRA = "Sobre";
const SEPARADOR = " · ";
const RAIZ = (equipo: string, dimension: string) => `${PALABRA} ${equipo.trim()}${SEPARADOR}${dimension.trim()}`;
/** Cualquier respuesta: «Sobre <equipo> · <parte> (» o «…:» al principio de un renglón. Las mismas piezas que `RAIZ`. */
const UNA_RESPUESTA = new RegExp(`^${PALABRA} .+${SEPARADOR.trim()} .+?( \\(|:)`, "i");
/** Los renglones de una nota: la nota junta, renglón por renglón, todo lo que la persona contó antes de guardar. */
const renglones = (texto: string) => texto.split(/\r?\n/).map((l) => l.trim());

/** Lo que el chat antepone a la respuesta: «Sobre Ventas · Datos (cómo registran hoy los contactos): ». */
export function prefijoDeLaRespuesta(p: Pick<PreguntaParaResponder, "equipo" | "dimension" | "pregunta">): string {
  const q = sinSignos(p.pregunta);
  return `${RAIZ(p.equipo, p.dimension)}${q ? ` (${q.slice(0, 200)})` : ""}: `;
}

/**
 * ¿Esta nota responde a esa pregunta? Un renglón que empieza con su «Sobre <equipo> · <parte>», sin importar mayúsculas.
 * En cualquier renglón (revisión del 24 nov): con algo contado antes sin guardar, la respuesta queda en el medio de la nota.
 */
export function respondeA(texto: string, equipo: string, dimension: string): boolean {
  const raiz = RAIZ(equipo, dimension).toLowerCase();
  return renglones(texto).some((l) => {
    const t = l.toLowerCase();
    return t.startsWith(`${raiz} (`) || t.startsWith(`${raiz}:`);
  });
}

/** ¿La nota trae la respuesta a alguna pregunta de La escala? (la misma forma que `respondeA`, en cualquier renglón) */
export const esRespuesta = (texto: string): boolean => renglones(texto).some((l) => UNA_RESPUESTA.test(l));

/**
 * El equipo que nombra cada respuesta de la nota («Sobre <equipo> · <parte> (…): …», en cualquier renglón), como lo
 * escribió la pantalla (el nombre del área en la escala de la empresa). Vacío si la nota no trae ninguna respuesta. Lo usa
 * «Ubicar» para no fijar con una respuesta de un equipo el nivel de otra área (agente-pedido.ts › `dimensionDeOtroEquipo`).
 */
export function equiposDeLasRespuestas(texto: string): string[] {
  return renglones(texto).flatMap((l) => {
    if (!UNA_RESPUESTA.test(l)) return [];
    const resto = l.slice(PALABRA.length).trim();
    const fin = resto.indexOf(SEPARADOR);
    return fin > 0 ? [resto.slice(0, fin).trim()] : [];
  });
}
