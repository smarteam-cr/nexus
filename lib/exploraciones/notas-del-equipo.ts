/**
 * lib/exploraciones/notas-del-equipo.ts — lo que sabe el equipo, como FUENTE del Resumen de La escala (Elías, 21 nov).
 * PURO.
 *
 * Cada nota de «Lo que sabes del cliente» (`sabido:<id>`, ./lo-que-sabes.ts) llega al agente del Resumen como una fuente
 * propia, `N1`, `N2`…, con la forma de una reunión (`ReunionParaElResumen`): cada renglón es un turno, «dicho» por quien
 * la escribió. Así su cita se verifica con la MISMA regla que la de una reunión (palabra por palabra, números,
 * herramientas, conclusiones) y no hace falta un segundo verificador. La diferencia la marca `delEquipo`: el prompt la
 * pone por encima de las reuniones (escalón 3 de lib/impacto/escalera.ts) y adentro la cita dice «lo dijo <persona> del
 * equipo». Afuera no se rotula: el vendedor lo ve antes de publicar y decide.
 *
 * No es una reunión: no cuenta en «Qué hicimos», ni en el peso de las sesiones, ni en «cada equipo con reunión en el
 * recorrido», ni en las reuniones de la corrida (`sourceSessionIds`).
 *
 * Desde el 25 nov también las lee «Ubicar» (`notasParaUbicar`; Elías: «Puede fijar el nivel»): ahí son fuentes `N1`, `N2`…
 * con la forma de siempre de una fuente de «Ubicar» (id, rótulo, texto), y un nivel puede salir de una de ellas.
 */
import type { TurnoNumerado } from "@/lib/analizador-venta/analisis";
import type { AutorDeLaNota, ItemPropuesto } from "./contenido";
import { diaConAnio, diaCorto } from "./fechas";
import type { Fuente } from "./fuentes-tipos";
import { loQueSabeElEquipo, LARGO_ENTERO, cuandoSeEscribioLaNota } from "./lo-que-sabes";
import type { ReunionParaElResumen } from "./resumen-de-la-escala";

/** Cuántas notas lee el Resumen como mucho (las más nuevas). */
export const MAX_NOTAS_EN_EL_RESUMEN = 12;
/** El prefijo del id de una fuente que es una nota: nunca choca con el de una reunión de Meet (un cuid). */
export const PREFIJO_DE_LA_NOTA = "nota:";

export const esNotaDelEquipo = (r: Pick<ReunionParaElResumen, "delEquipo">): boolean => !!r.delEquipo;

/**
 * Las reuniones de verdad, sin las notas: las que van a `sourceSessionIds` de la corrida y las que deciden si hay con qué
 * armar el Resumen (sin ninguna reunión con texto no se arma, aunque haya notas).
 */
export function reunionesDeVerdad<T extends Pick<ReunionParaElResumen, "delEquipo">>(reuniones: readonly T[]): T[] {
  return reuniones.filter((r) => !esNotaDelEquipo(r));
}

/** Quién la escribió, como lo dice una cita: su nombre; sin nombre, «Alguien del equipo». */
export function quienLaEscribio(autor: AutorDeLaNota | undefined, nombreDe: (correo: string) => string | null): string {
  const correo = autor?.por?.trim().toLowerCase();
  return (correo && nombreDe(correo)) || "Alguien del equipo";
}

/**
 * Las notas del equipo como fuentes del Resumen, de la más vieja a la más nueva (las `MAX_NOTAS_EN_EL_RESUMEN` más
 * nuevas). Una nota larga entra hasta `LARGO_ENTERO`, como en la guía.
 */
export function notasComoFuentes(
  notas: Readonly<Record<string, string>>,
  autores: Readonly<Record<string, AutorDeLaNota>> | undefined,
  nombreDe: (correo: string) => string | null,
): ReunionParaElResumen[] {
  const lista = loQueSabeElEquipo(notas).slice(-MAX_NOTAS_EN_EL_RESUMEN);
  return lista.map(({ clave, texto }, i) => {
    const autor = autores?.[clave];
    const hablante = quienLaEscribio(autor, nombreDe);
    const en = cuandoSeEscribioLaNota(clave, autor) ?? new Date(0).toISOString();
    const turnos: TurnoNumerado[] = texto
      .slice(0, LARGO_ENTERO)
      .split(/\n+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t, k) => ({ n: k + 1, hablante, texto: t }));
    return {
      id: `${PREFIJO_DE_LA_NOTA}${clave}`,
      clave: `N${i + 1}`,
      fecha: en,
      equipo: null,
      areaId: null,
      turnos,
      // Quien la escribió es la voz de la fuente: su cita vale como la de alguien de la empresa, con su rótulo.
      delCliente: [hablante],
      delEquipo: { por: autor?.por ?? null, en, nombre: hablante },
    };
  });
}

// ── Las notas en «Ubicar» (25 nov, Elías: «Puede fijar el nivel») ────────────

/** Cuántas notas lee «Ubicar» como mucho (las más nuevas): las mismas que el Resumen. */
export const MAX_NOTAS_EN_UBICAR = MAX_NOTAS_EN_EL_RESUMEN;
/** Cómo empieza el rótulo de una nota como fuente de «Ubicar»: lo ve el equipo en «de dónde sale». */
export const ROTULO_DE_LA_NOTA = "Nota del equipo";

/** Las notas que lee «Ubicar» hoy, de la más vieja a la más nueva (las `MAX_NOTAS_EN_UBICAR` más nuevas). */
export function notasQueLeeUbicar(notas: Readonly<Record<string, string>>): { clave: string; texto: string }[] {
  return loQueSabeElEquipo(notas).slice(-MAX_NOTAS_EN_UBICAR);
}

/**
 * Las notas del equipo como fuentes de «Ubicar» (lib/exploraciones/posicionar-fuentes.ts): `N1`, `N2`… de la más vieja a
 * la más nueva, con el texto de la nota (hasta `LARGO_ENTERO`, como en el Resumen). Dos rótulos:
 *   · `etiqueta`, «Nota del equipo · <persona>, <día>»: lo que ve el equipo en «de dónde sale» de un nivel que sale de ella
 *     (la sugerencia la guarda con la cita). Nunca llega al cliente: su página lee solo el nivel.
 *   · `paraElAgente`, «Nota del equipo, <día con año>»: SIN el nombre (revisión del 25 nov). Lo que la IA no sabe no lo
 *     puede escribir en un porqué ni en la tarjeta de una parte, que una persona puede pasar a la página del cliente.
 * `claves`: las notas que leyó, para la corrida (`CorridaDelAgente.notas`). Una nota no es palabra del cliente, pero desde
 * el 25 nov puede fijar un nivel: lo dice el pedido (agente-pedido.ts › `REGLA_DE_LAS_NOTAS_EN_UBICAR`).
 */
export function notasParaUbicar(
  notas: Readonly<Record<string, string>>,
  autores: Readonly<Record<string, AutorDeLaNota>> | undefined,
  nombreDe: (correo: string) => string | null,
): { fuentes: Fuente[]; claves: string[] } {
  const lista = notasQueLeeUbicar(notas);
  return {
    fuentes: lista.map(({ clave, texto }, i) => {
      const autor = autores?.[clave];
      const en = cuandoSeEscribioLaNota(clave, autor);
      const quien = quienLaEscribio(autor, nombreDe);
      return {
        id: `N${i + 1}`,
        etiqueta: `${ROTULO_DE_LA_NOTA} · ${quien}${en ? `, ${diaCorto(en)}` : ""}`,
        paraElAgente: `${ROTULO_DE_LA_NOTA}${en ? `, ${diaConAnio(en)}` : ""}`,
        texto: texto.slice(0, LARGO_ENTERO),
      };
    }),
    claves: lista.map((n) => n.clave),
  };
}

/** La regla de peso de una nota frente a una reunión: la misma en el Resumen y en «Ubicar» (escalera del 21 nov). */
export const GANA_LA_NOTA = "si una nota y una reunión se contradicen, gana la nota";

/** ¿Esta fuente de «Ubicar» es una nota del equipo? (`N1`, `N2`…; la N0 de las notas de las sesiones es de leer una reunión.) */
export const esNotaEnUbicar = (id: string): boolean => /^N[1-9]\d*$/.test(id);

/** Cuántos de esos niveles sugeridos salen de una nota del equipo (su frase citada es de una `N`). */
export function nivelesDeUnaNota(items: readonly Pick<ItemPropuesto, "destino" | "fuentes">[]): number {
  return items.filter((it) => it.destino.tipo === "nivel" && it.fuentes.some((f) => f.cita && esNotaEnUbicar(f.id))).length;
}

/**
 * Cómo nombra la franja de sugerencias de La escala los niveles con evidencia (PasoEscala › `SugerenciasDeLaEscala`): «2
 * niveles con lo que dijo el cliente» o, si alguno sale de una nota del equipo (25 nov), «3 niveles con evidencia (1 de una
 * nota del equipo)». Así nadie usa todas creyendo que todo es palabra del cliente. "" sin niveles.
 */
export function nivelesSugeridosEnPalabras(niveles: number, deUnaNota: number): string {
  if (!niveles) return "";
  const cuantos = `${niveles} ${niveles === 1 ? "nivel" : "niveles"}`;
  if (!deUnaNota) return `${cuantos} con lo que dijo el cliente`;
  const de = deUnaNota >= niveles ? (niveles === 1 ? "de" : "todos de") : `${deUnaNota} de`;
  return `${cuantos} con evidencia (${de} una nota del equipo)`;
}

/** El bloque de las notas en el pedido del Resumen: van antes de las reuniones, con su peso. */
export function bloqueDeLasNotas(notas: readonly ReunionParaElResumen[]): string {
  if (!notas.length) return "";
  const cada = notas.map((r) => `### ${r.clave} · ${r.fecha.slice(0, 10)} · nota del equipo (la escribió ${r.delEquipo?.nombre ?? "alguien del equipo"})\n${r.turnos.map((t) => `[${t.n}] ${t.hablante}: ${t.texto}`).join("\n")}`);
  return `Lo que CONFIRMÓ el equipo de Smarteam (notas N1, N2…; pesan MÁS que las reuniones: ${GANA_LA_NOTA}; se citan igual, con "reunion":"N1"):\n\n${cada.join("\n\n")}`;
}
