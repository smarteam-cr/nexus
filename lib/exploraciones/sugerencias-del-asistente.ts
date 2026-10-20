/**
 * lib/exploraciones/sugerencias-del-asistente.ts — lo que se le puede pedir al asistente sobre la guía de una sesión, en
 * botones que llenan el pedido con un clic (Elías, 2026-10-19, pruebas 104, 106 y 107). PURO y sin IA: sale de la guía
 * que se ve (las preguntas YA ajustadas) y de lo que cubre (que-cubre-la-guia.ts).
 *
 * Como mucho 4, en este orden:
 *   1. la pregunta con menos repreguntas: que bajen a números;
 *   2. las dimensiones de las áreas en juego que la guía no pregunta y no tienen evidencia (hasta 2);
 *   3. lo primero que falta para proponer y la guía no pregunta (en un proyecto, de la estrategia; y si la guía no
 *      pregunta por lo vendido, una pregunta sobre eso);
 *   4. para completar: acortar las preguntas largas, o qué otras agregaría.
 *
 * Las preguntas se nombran por su TEMA, no por su número: la pantalla no numera las preguntas.
 */
import { MAX_REPREGUNTAS } from "./ajustes-de-la-guia";
import { temaDeLaPregunta, ladoDeLaPregunta, type PosicionParaLaGuia, type PreguntaParaMostrar } from "./guia";
import type { LoQueCubreLaGuia } from "./que-cubre-la-guia";

export const MAX_SUGERENCIAS_DEL_ASISTENTE = 4;
/** Una pregunta con más palabras que esto se lee larga en la reunión. */
const PALABRAS_DE_UNA_PREGUNTA_LARGA = 25;

/** Cómo se dice cada punto para proponer dentro de «Agrega una pregunta sobre …». */
const PUNTO_EN_LA_FRASE: Readonly<Record<string, string>> = {
  frena: "qué frena al equipo",
  meta: "la meta en cifras",
  tiempos: "para cuándo lo necesitan",
  presupuesto: "el presupuesto o contra qué lo comparan",
  autoridad: "quién firma",
  consecuencia: "qué pasa si no actúan",
  // La estrategia de un proyecto (Customer Success).
  retos: "los retos del negocio",
  metas: "los resultados que persiguen, en cifras",
  obstaculos: "lo que les impide llegar",
};

export const SUGERENCIA_DE_LO_VENDIDO = "Agrega una pregunta sobre cómo van a usar lo que se vendió";

const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const enLista = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

export function sugerenciasDelAsistente(o: {
  preguntas: readonly PreguntaParaMostrar[];
  cubre: Pick<LoQueCubreLaGuia, "puntos">;
  /** Las dimensiones que aplican en las áreas en juego, en el orden de la escala. */
  dimensiones: readonly { id: string; nombre: string }[];
  posiciones: Readonly<Record<string, PosicionParaLaGuia | undefined>>;
  /** El nombre de un tema (una tarjeta o una dimensión), como lo dice la pantalla. */
  nombreDe: (tema: string) => string;
  /** Solo en un proyecto: la guía no trae preguntas de lo vendido. */
  sinLoVendido?: boolean;
}): string[] {
  const out: string[] = [];

  // 1. La pregunta con menos repreguntas (la primera, si empatan): que bajen a números.
  const conPocas = o.preguntas.reduce<PreguntaParaMostrar | null>(
    (min, p) => (p.repreguntas.length < MAX_REPREGUNTAS && (!min || p.repreguntas.length < min.repreguntas.length) ? p : min),
    null,
  );
  if (conPocas) {
    const tema = temaDeLaPregunta(conPocas);
    const cual = tema ? `la pregunta de ${o.nombreDe(tema)}` : `«${recortar(conPocas.pregunta, 50)}»`;
    out.push(
      conPocas.repreguntas.length === 0
        ? `Agrega repreguntas a ${cual} que bajen a números`
        : `Mejora las repreguntas de ${cual} para que bajen a números`,
    );
  }

  // 2. Las dimensiones en juego que la guía no pregunta y no tienen evidencia: primero las sin dato.
  const preguntadas = new Set(o.preguntas.filter((p) => ladoDeLaPregunta(p) === "dimension").map(temaDeLaPregunta));
  const sinPreguntar = o.dimensiones
    .filter((d) => !preguntadas.has(d.id) && o.posiciones[d.id]?.clase !== "evidencia")
    .sort((a, b) => Number(!!o.posiciones[a.id]) - Number(!!o.posiciones[b.id]))
    .slice(0, 2);
  if (sinPreguntar.length === 2) out.push(`Agrega dos preguntas de la escala sobre ${enLista(sinPreguntar.map((d) => d.nombre))}`);
  else if (sinPreguntar.length === 1) out.push(`Agrega una pregunta de la escala sobre ${sinPreguntar[0].nombre}`);

  // 3. Lo primero que falta para proponer y ninguna pregunta cubre (el siguiente paso lo pide el cierre).
  const falta = o.cubre.puntos.find((p) => p.estado === "falta" && p.id !== "siguientePaso" && !(p.id === "frena" && sinPreguntar.length));
  if (falta) out.push(`Agrega una pregunta sobre ${PUNTO_EN_LA_FRASE[falta.id] ?? minuscula(falta.corto)}`);
  if (o.sinLoVendido) out.push(SUGERENCIA_DE_LO_VENDIDO);

  // 4. Para completar.
  const hayLargas = o.preguntas.some((p) => p.pregunta.split(/\s+/).length > PALABRAS_DE_UNA_PREGUNTA_LARGA);
  for (const extra of [hayLargas ? "Haz más cortas las preguntas" : null, "¿Qué otras preguntas agregarías?", "Haz más cortas las preguntas"]) {
    if (out.length >= 3) break;
    if (extra && !out.includes(extra)) out.push(extra);
  }
  return out.slice(0, MAX_SUGERENCIAS_DEL_ASISTENTE);
}
