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
 */
import type { TurnoNumerado } from "@/lib/analizador-venta/analisis";
import type { AutorDeLaNota } from "./contenido";
import { loQueSabeElEquipo, LARGO_ENTERO, cuandoSeAgrego } from "./lo-que-sabes";
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
    const en = autor?.en ?? (cuandoSeAgrego(clave) !== null ? new Date(cuandoSeAgrego(clave)!).toISOString() : new Date(0).toISOString());
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

/** El bloque de las notas en el pedido del Resumen: van antes de las reuniones, con su peso. */
export function bloqueDeLasNotas(notas: readonly ReunionParaElResumen[]): string {
  if (!notas.length) return "";
  const cada = notas.map((r) => `### ${r.clave} · ${r.fecha.slice(0, 10)} · nota del equipo (la escribió ${r.delEquipo?.nombre ?? "alguien del equipo"})\n${r.turnos.map((t) => `[${t.n}] ${t.hablante}: ${t.texto}`).join("\n")}`);
  return `Lo que CONFIRMÓ el equipo de Smarteam (notas N1, N2…; pesan MÁS que las reuniones: si una nota y una reunión se contradicen, gana la nota; se citan igual, con "reunion":"N1"):\n\n${cada.join("\n\n")}`;
}
