/**
 * lib/exploraciones/estado-de-las-tarjetas.ts — qué tan sabida está cada tarjeta del marco, para que el color del panel
 * diga la verdad. PURO (lo usan el panel de la derecha y «lista para proponer»).
 *
 * Feedback de Ventas del 22 oct: el panel se ve «todo en verde» y no refleja lo que pasa. Medido ese día (solo lectura):
 * en Cicadex, «Tiempos» estaba en verde con «No determinado por el momento, primero haremos un diagnóstico completo» y
 * «Sin fecha límite explícita…», y «Quién decide» con dos personas que influyen y ninguna que apruebe; «Para proponer»
 * contaba el «Para cuándo» como listo. Verde era «tiene texto». Y una tarjeta verde escondía lo nuevo que traía una
 * sesión (el ícono de sugerida solo aparecía en una vacía).
 *
 * Ahora cada tarjeta está:
 *   · `completa` — dice algo que sirve: la meta con cifra, alguien que aprueba, un texto que no dice «no se sabe».
 *   · `aMedias` — tiene texto pero no alcanza: una meta sin cifra, quién decide sin quien aprueba, o todo lo que dice es
 *     que no se sabe. Va en ámbar, con el motivo.
 *   · `sugerida` — vacía, con algo que propuso el agente.
 *   · `falta` — vacía.
 * `nuevo`: lo que propuso el agente para una tarjeta que ya tiene algo (una sesión trajo más): un punto en el panel.
 */
import { metaEnCifras, type ClaveDeCasilla, type Meta, type Persona } from "./casillas";

export type EstadoDeLaTarjeta = "completa" | "aMedias" | "sugerida" | "falta";

/**
 * ¿El texto dice que no se sabe? «No determinado por el momento», «Sin fecha límite explícita», «por definir», «no lo
 * confirmaron», «no hay presupuesto definido»… Lo que pasa cuando se confirma lo que el agente leyó de una reunión en la
 * que el tema no salió.
 */
const NO_SE_SABE =
  /\b(no (est[aá]n? |fue |ha sido |se ha |se |lo )?(determinad|definid|confirmad|declarad|mencionad|especificad|precisad|establecid|sab)|no (hay|tienen|tiene|existe) (un |una |ning[uú]n |ninguna )?(fecha|plazo|presupuesto|rango|monto|l[ií]mite|cifra)|sin (una |un )?(fecha|plazo|presupuesto|rango|monto|l[ií]mite|cifra)s?\b|por (definir|confirmar|determinar)|a[uú]n no (lo |la )?(sab|defin|confirm|determin)|pendiente de (definir|confirmar)|se desconoce|desconocid[oa]|no indic[oó]|no dijo)/i;

export function diceQueNoSeSabe(texto: string): boolean {
  return NO_SE_SABE.test(texto);
}

/** Los textos de una tarjeta, cualquiera sea su forma (texto, lista, metas, retos, personas). */
function textosDe(valor: unknown): string[] {
  if (typeof valor === "string") return valor.trim() ? [valor] : [];
  if (!Array.isArray(valor)) return [];
  return valor
    .map((x) => (typeof x === "string" ? x : typeof x === "object" && x ? String((x as Record<string, unknown>).que ?? (x as Record<string, unknown>).texto ?? (x as Record<string, unknown>).nombre ?? "") : ""))
    .filter((t) => t.trim());
}

/** ¿Tiene algo que sirva? Un texto, y no solo frases que dicen que no se sabe. */
export function conAlgoQueSirve(valor: unknown): boolean {
  const textos = textosDe(valor);
  return textos.length > 0 && textos.some((t) => !diceQueNoSeSabe(t));
}

export interface EstadoDeUnaTarjeta {
  estado: EstadoDeLaTarjeta;
  /** Por qué está a medias, en pocas palabras (para el título del botón). */
  motivo?: string;
  /** Tiene algo y el agente propuso más: una sesión trajo algo nuevo para revisar. */
  nuevo: boolean;
}

export function estadoDeLaTarjeta(clave: ClaveDeCasilla, valor: unknown, propuestas: number): EstadoDeUnaTarjeta {
  const textos = textosDe(valor);
  if (!textos.length) return { estado: propuestas > 0 ? "sugerida" : "falta", nuevo: false };
  const nuevo = propuestas > 0;
  if (clave === "metas" && Array.isArray(valor) && !(valor as Meta[]).some(metaEnCifras)) {
    return { estado: "aMedias", motivo: "ninguna meta tiene cifra", nuevo };
  }
  if (clave === "autoridad" && Array.isArray(valor) && !(valor as Persona[]).some((p) => p?.rol === "firma")) {
    return { estado: "aMedias", motivo: "nadie aprueba todavía", nuevo };
  }
  if (!textos.some((t) => !diceQueNoSeSabe(t))) return { estado: "aMedias", motivo: "lo que dice es que no se sabe", nuevo };
  return { estado: "completa", nuevo };
}
