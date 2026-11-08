/**
 * lib/analizador-venta/para-la-guia.ts — LO QUE EL ANÁLISIS DE UNA SESIÓN LE DEJA A LA GUÍA DE LA SIGUIENTE (2026-11-08,
 * Elías con Centauro). PURO y client-safe.
 *
 * «Todo esto también debe alimentar "Preparar la siguiente sesión"»: tres insumos, sacados de lo que el análisis ya
 * verificó, sin IA:
 *   · las preguntas que faltan de la tabla de números;
 *   · los huecos de decisión que siguen abiertos (lo que ya se sabía no viaja);
 *   · las preguntas para el demo, con quién preguntó.
 * El lado del servidor (para-la-guia-server.ts) elige el análisis; esto lo convierte en lo que lee el pedido de la guía.
 */
import { TEXTO_DEL_HUECO, type HuecoDeDecision, type ResultadoDelAnalisis } from "./analisis";

export interface InsumosParaLaGuia {
  /** Lo que falta saber de los números del cliente, como pregunta. */
  preguntasDeNumeros: string[];
  /** Los huecos de decisión abiertos: cuál y su pregunta. */
  huecosDeDecision: { hueco: HuecoDeDecision; pregunta: string }[];
  /** Las funciones por las que preguntó el cliente, para el demo. */
  preguntasDelDemo: { pregunta: string; quien: string }[];
}

export const SIN_INSUMOS: InsumosParaLaGuia = { preguntasDeNumeros: [], huecosDeDecision: [], preguntasDelDemo: [] };

/** Los tres insumos de un análisis guardado. Un análisis de antes del 8 nov no los tiene: vacíos. */
export function insumosParaLaGuia(r: Pick<ResultadoDelAnalisis, "numeros" | "decision" | "demo"> | null | undefined): InsumosParaLaGuia {
  if (!r) return SIN_INSUMOS;
  return {
    preguntasDeNumeros: (r.numeros ?? []).map((f) => f.falta).filter((x): x is string => !!x),
    huecosDeDecision: (r.decision ?? []).filter((d) => !d.seSabe).map((d) => ({ hueco: d.hueco, pregunta: d.texto })),
    preguntasDelDemo: (r.demo ?? []).map((d) => ({ pregunta: d.pregunta, quien: d.quien })),
  };
}

export const hayInsumos = (i: InsumosParaLaGuia) => i.preguntasDeNumeros.length + i.huecosDeDecision.length + i.preguntasDelDemo.length > 0;

/** Los insumos como líneas para el pedido de la guía (lib/exploraciones/guia-pedido.ts › `delAnalisisDeLaVenta`). */
export function insumosComoLineas(i: InsumosParaLaGuia, deLaSesion: string): string[] {
  if (!hayInsumos(i)) return [];
  return [
    `Del análisis de ${deLaSesion}:`,
    ...i.preguntasDeNumeros.map((p) => `- Número que falta: ${p}`),
    ...i.huecosDeDecision.map((h) => `- Falta para decidir (${TEXTO_DEL_HUECO[h.hueco]}): ${h.pregunta}`),
    ...i.preguntasDelDemo.map((d) => `- Para el demo (lo preguntó ${d.quien}): ${d.pregunta}. No se responde en la exploración: se muestra en el demo.`),
  ];
}

/**
 * ¿La tarjeta dice que NO se sabe? En Centauro, «Presupuesto» decía «No se discutió presupuesto en esta reunión.»: eso no
 * es saber cuánto pueden invertir.
 */
export function diceQueNoSeSabe(t: string): boolean {
  return /\b(no se (discuti|habl|mencion|sabe|dijo|toc|pregunt|defini|conoce)|sin (dato|informaci|definir)|por (averiguar|definir|confirmar)|pendiente|desconocid)/i.test(
    t.normalize("NFD").replace(/[̀-ͯ]/g, ""),
  );
}

/** El valor de una tarjeta del resumen de la preventa, en una línea: un texto, una lista, o personas con su papel. */
export function tarjetaEnUnaLinea(v: unknown): string | null {
  const uno = (x: unknown): string => {
    if (typeof x === "string") return x.trim();
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const nombre = typeof o.nombre === "string" ? o.nombre.trim() : "";
      const rol = typeof o.rol === "string" ? o.rol.trim() : typeof o.cargo === "string" ? o.cargo.trim() : "";
      const t = [o.que, o.texto].find((y): y is string => typeof y === "string" && !!y.trim());
      return t?.trim() ?? (nombre ? `${nombre}${rol ? ` (${rol})` : ""}` : "");
    }
    return "";
  };
  const partes = (Array.isArray(v) ? v : [v]).map(uno).filter((x) => x && !diceQueNoSeSabe(x));
  return partes.length ? partes.join(" · ").slice(0, 300) : null;
}
