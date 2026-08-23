/**
 * lib/canvas/senalar.ts — A QUÉ APUNTA EL 💬 DE UN ÍTEM.
 *
 * Puro, sin React, porque es donde vive la decisión que importa: **cuándo NO hay botón**. El
 * componente (`components/landing/senalar.tsx`) solo lo dibuja.
 *
 * ⭐ La lista se resuelve por IDENTIDAD DE REFERENCIA contra el `data` de la sección, no por un
 * nombre que cada renderer escriba a mano. Un nombre escrito a mano puede quedar viejo —el día que
 * alguien renombre la clave en el esquema, el botón seguiría señalando la lista anterior y el chat
 * escribiría en otro lado, en silencio—. Una referencia no puede quedar vieja.
 */

type NodoDeSchema = { type?: string; properties?: Record<string, unknown> };

/** Lo mínimo que hace falta saber de la sección que se está pintando. */
export interface SeccionParaSenalar {
  data: Record<string, unknown>;
  /** El esquema que el CHAT alcanza (`schemaParaElChat`). */
  schema: unknown;
}

/** Cuánto texto se manda como cita. Suficiente para identificar, corto para leerse en el chip. */
export const LARGO_DE_CITA = 120;

export const recortarParaCita = (v: string): string => {
  const t = v.trim().replace(/\s+/g, " ");
  return t.length > LARGO_DE_CITA ? t.slice(0, LARGO_DE_CITA) : t;
};

/**
 * ¿Qué lista del documento ES este array? `null` cuando no es ninguna — y ése es el caso que hace
 * el trabajo: sin lista no se pinta botón.
 *
 * Dos motivos para devolver `null`, los dos deliberados:
 *   · **Lista DERIVADA** — la que el renderer arma al vuelo (un filtrado, un `?? []`, una
 *     normalización). No es la del documento, así que señalarla apuntaría a un índice que no
 *     existe del otro lado.
 *   · **Fuera del esquema del chat** — el vocabulario no puede tocarla. Un botón que abre el chat
 *     sobre algo que el chat no alcanza es una promesa que se rompe en el segundo clic.
 */
export function listaDeLaSeccion(
  sec: SeccionParaSenalar | null,
  items: unknown[],
): string | null {
  if (!sec || !Array.isArray(items)) return null;
  const props = (sec.schema as NodoDeSchema | undefined)?.properties ?? {};
  for (const [k, v] of Object.entries(sec.data)) {
    /* ⛔ `===`, nunca una comparación por contenido: dos listas distintas pueden tener los mismos
       textos, y ahí una comparación por valor elegiría la equivocada sin que nada avise. */
    if (v !== items) continue;
    return (props[k] as NodoDeSchema | undefined)?.type === "array" ? k : null;
  }
  return null;
}

/**
 * Cómo se llama un ítem: el primer texto CON CONTENIDO.
 *
 * Mismo criterio que el ancla del vocabulario (`identidadDeItem`), y a propósito: es el texto que
 * la persona ve como título de esa tarjeta, y el que el chat va a poder buscar como `cita`.
 */
export function citaDelItem(item: unknown): string | null {
  if (typeof item === "string") return item.trim() ? recortarParaCita(item) : null;
  if (item && typeof item === "object") {
    for (const v of Object.values(item as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) return recortarParaCita(v);
    }
  }
  return null;
}
