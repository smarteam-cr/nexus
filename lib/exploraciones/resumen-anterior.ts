/**
 * lib/exploraciones/resumen-anterior.ts — «Volver a la versión anterior» del Resumen de La escala (Elías, 21 nov).
 *
 * Al rehacer el Resumen («Rehacer con IA» o la cuenta regresiva del agente de impacto), el que había se guarda tal como
 * estaba, con lo escrito a mano, en `contenido.resumenAnterior`. Una sola versión atrás. Volver la pone otra vez y deja
 * como anterior la que se reemplazó: volver también se deshace con el mismo botón.
 *
 * Nunca toca lo publicado (`AccesoALaEscala.publicada`): el cliente ve lo mismo hasta que alguien aprieta «Publicar».
 * No sube la versión de la exploración (como el Resumen). Lo que protege de pisar a otra persona es la FIRMA: la pantalla
 * manda la del Resumen y la anterior que ve, y si en el servidor ya son otras, 409.
 *
 * Client-safe: lo usa la pantalla para la firma y el servidor para guardar (./resumen-de-la-escala-server.ts).
 */
import type { ContenidoDeExploracion } from "./contenido";
import type { ResumenGuardado } from "./resumen-de-la-escala";

/** Cómo quedó guardada la anterior: al rehacer el Resumen, o al volver a la versión anterior. */
export const MOTIVOS_DE_LA_ANTERIOR = ["rehacer", "volver"] as const;
export type MotivoDeLaAnterior = (typeof MOTIVOS_DE_LA_ANTERIOR)[number];

/** El Resumen que se reemplazó, tal como estaba, con quién y cuándo lo reemplazó. */
export interface ResumenAnterior {
  resumen: ResumenGuardado;
  /** Cuándo se reemplazó (ISO). */
  en: string;
  /** Quién lo reemplazó (su correo). null: no se sabe. */
  por: string | null;
  motivo: MotivoDeLaAnterior;
}

interface Quien {
  por: string | null;
  en: string;
}

/**
 * El contenido con el Resumen nuevo, y el que había como versión anterior. Sin Resumen antes (el primer armado), la
 * anterior queda como estaba: no hay nada que guardar.
 */
export function conElResumenNuevo(c: ContenidoDeExploracion, nuevo: ResumenGuardado, quien: Quien): ContenidoDeExploracion {
  const antes = c.resumenDeLaEscala;
  return {
    ...c,
    resumenDeLaEscala: nuevo,
    ...(antes ? { resumenAnterior: { resumen: antes, en: quien.en, por: quien.por, motivo: "rehacer" as const } } : {}),
  };
}

export type ResultadoDeVolver = { ok: true; contenido: ContenidoDeExploracion } | { ok: false; motivo: "sin-anterior" | "cambio" };

/**
 * Vuelve a la versión anterior: la pone como Resumen y deja la de ahora como anterior. `firma` es la que vio la pantalla
 * (`firmaParaVolver`): si no coincide, alguien cambió el Resumen o la anterior entretanto y no se pisa nada.
 */
export function volverALaAnterior(c: ContenidoDeExploracion, firma: string, quien: Quien): ResultadoDeVolver {
  const anterior = c.resumenAnterior;
  if (!anterior) return { ok: false, motivo: "sin-anterior" };
  if (firmaParaVolver(c) !== firma) return { ok: false, motivo: "cambio" };
  const ahora = c.resumenDeLaEscala;
  const { resumenAnterior: _fuera, ...sin } = c;
  void _fuera;
  return {
    ok: true,
    contenido: {
      ...sin,
      resumenDeLaEscala: anterior.resumen,
      // Sin Resumen ahora no queda anterior (no pasa: la anterior solo se guarda al reemplazar uno).
      ...(ahora ? { resumenAnterior: { resumen: ahora, en: quien.en, por: quien.por, motivo: "volver" as const } } : {}),
    },
  };
}

/** JSON con las claves ordenadas y sin las `undefined`: lo mismo leído en el servidor y llegado a la pantalla. */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** cyrb53: un número de 53 bits del texto, en base 36. No es seguridad: solo dice si algo cambió. */
function huella(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** La firma del Resumen de ahora y de su anterior, como los ve quien aprieta «Volver a la versión anterior». */
export function firmaParaVolver(c: Pick<ContenidoDeExploracion, "resumenDeLaEscala" | "resumenAnterior">): string {
  return huella(`${canonico(c.resumenDeLaEscala ?? null)}|${canonico(c.resumenAnterior ?? null)}`);
}
