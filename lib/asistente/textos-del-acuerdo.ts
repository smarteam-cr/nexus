/**
 * lib/asistente/textos-del-acuerdo.ts — LO QUE DICE EL BOTÓN DE UN ACUERDO SOBRE LA PROPUESTA (E3 P5).
 *
 * PURO. Sin React. Lo usa el cajón del chat (ChatDelAsistente.tsx).
 *
 * Con una propuesta del cronograma abierta, lo acordado no se aplica al cronograma: pasa a la PROPUESTA
 * (o, si se pidió eso, la aplica entera o la descarta). El botón, la espera y la caja ya resuelta lo
 * dicen con esas palabras; «Aplicar al cronograma» sobre algo que va a la propuesta mentiría.
 * Sin propuesta (`borrador` null o ausente) todas devuelven null y el cajón usa sus textos de siempre.
 */
import type { CambioAcordado } from "./acuerdo";

export type ClaseDeAcuerdo = "pasar" | "aplicar" | "descartar";

/**
 * E4 (2026-09): un acuerdo del cronograma SIN operaciones es de una versión anterior (los hilos de antes
 * del 2026-08-20 guardaban solo una instrucción de texto, que ejecutaba «Pedir cambio con IA»). Ese
 * carril se retiró: el botón no aplica y dice esto (≤ 60 caracteres: va EN el botón).
 */
export const ACUERDO_DE_OTRA_VERSION = "Es de una versión anterior: pídemelo de nuevo";

/** Qué hace el botón de este acuerdo, o null si es de los de siempre (sin propuesta). */
export function claseDeAcuerdo(a: Pick<CambioAcordado, "borrador" | "operaciones">): ClaseDeAcuerdo | null {
  if (typeof a.borrador !== "string") return null;
  const ops = (a.operaciones ?? []) as Array<{ op?: unknown }>;
  if (ops.length === 1 && ops[0]?.op === "propuesta.aplicar") return "aplicar";
  if (ops.length === 1 && ops[0]?.op === "propuesta.descartar-entera") return "descartar";
  return "pasar";
}

/** El botón: «Pasar a la propuesta (N)» (N = lo que queda marcado), «Aplicar la propuesta al
 *  cronograma» o «Descartar la propuesta». */
export function textoDelBoton(a: Pick<CambioAcordado, "borrador" | "operaciones">, aceptadas: number): string | null {
  const clase = claseDeAcuerdo(a);
  if (clase === "aplicar") return "Aplicar la propuesta al cronograma";
  if (clase === "descartar") return "Descartar la propuesta";
  if (clase === "pasar") return `Pasar a la propuesta (${aceptadas})`;
  return null;
}

/** Mientras corre: «Pasando a la propuesta…», «Aplicando la propuesta…», «Descartando la propuesta…». */
export function textoMientrasAplica(a: Pick<CambioAcordado, "borrador" | "operaciones">): string | null {
  const clase = claseDeAcuerdo(a);
  if (clase === "aplicar") return "Aplicando la propuesta…";
  if (clase === "descartar") return "Descartando la propuesta…";
  if (clase === "pasar") return "Pasando a la propuesta…";
  return null;
}

/** La caja ya resuelta, en una línea. null = la de siempre («Aplicado. ¿Hay que cambiar algo más?»). */
export function textoDelAcuerdoAplicado(a: Pick<CambioAcordado, "borrador" | "operaciones">): string | null {
  const clase = claseDeAcuerdo(a);
  if (clase === "aplicar") return "Propuesta aplicada al cronograma.";
  if (clase === "descartar") return "Propuesta descartada.";
  if (clase === "pasar") return "Pasado a la propuesta. ¿Algo más, o la aplicas?";
  return null;
}

/** El rótulo de la caja ya resuelta. null = el de siempre (« · ya aplicado»). */
export function rotuloDelAcuerdoAplicado(a: Pick<CambioAcordado, "borrador" | "operaciones">): string | null {
  const clase = claseDeAcuerdo(a);
  if (clase === "aplicar") return " · propuesta aplicada";
  if (clase === "descartar") return " · propuesta descartada";
  if (clase === "pasar") return " · ya en la propuesta";
  return null;
}

/**
 * El desenlace que queda en el hilo cuando lo acordado fue a la PROPUESTA o se descartó la propuesta
 * (tuteo: es la voz del asistente y el modelo lo relee). null = los de siempre (lib/asistente/handler.ts:
 * el cronograma, o la vista previa del editor de un documento).
 */
export function textoDelDesenlaceDeLaPropuesta(
  destino: "cronograma" | "propuesta" | "descarte" | undefined,
  detalle: string,
): string | null {
  if (destino === "descarte") return "✅ Listo, se descartó la propuesta: el cronograma queda como estaba.";
  if (destino !== "propuesta") return null;
  return detalle
    ? `⚠ Pasó a la propuesta, pero con una parte hice algo distinto:\n\n${detalle}\n\nRevísala arriba del Gantt.`
    : "✅ Listo, quedó en la propuesta (arriba del Gantt). El cronograma no cambia hasta que la apliques.";
}

/** A dónde fue lo acordado: lo lee el desenlace del hilo (`destino`). null = sin propuesta (se deduce). */
export function destinoDelAcuerdo(
  a: Pick<CambioAcordado, "borrador" | "operaciones">,
): "cronograma" | "propuesta" | "descarte" | null {
  const clase = claseDeAcuerdo(a);
  if (clase === "aplicar") return "cronograma";
  if (clase === "descartar") return "descarte";
  if (clase === "pasar") return "propuesta";
  return null;
}
