/**
 * El arreglo puntual de la guía de la próxima sesión (2026-11-08).
 *
 * Antes, si la guía salía con voseo o con preguntas cerradas, dobles o con un espacio por completar, se pedía la guía
 * ENTERA otra vez: medido en producción el 2026-11-08, cada pedido tarda unos 95 a 100 segundos (unos 5.000 tokens de
 * salida desde que cada bloque trae su guía corta y «Para profundizar») y el reintento saltaba casi siempre, así que el
 * vendedor esperaba más de tres minutos después de elegir el objetivo. Ahora se reescriben SOLO los textos con problema
 * (una llamada chica, unos segundos) y se vuelven a meter en la misma respuesta, que se lee igual que antes.
 *
 * Funciones puras: juntar los textos con problema, el pedido, leer la respuesta y aplicarla. La llamada vive en agente.ts.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { formasDeVoseo } from "@/lib/ui/voseo-formas";
import { partirPreguntaDoble, sinHuecos } from "./agenda";
import { HERRAMIENTA_DE_LA_GUIA, MODELO_DE_LA_GUIA } from "./guia-pedido";

export const HERRAMIENTA_DEL_ARREGLO = "reescribir_textos";
/** Tope de textos por arreglo: más que esto es una guía mala entera, y se queda la mejor de las dos igual. */
export const MAX_TEXTOS_A_ARREGLAR = 30;
const MAX_LARGO = 600;

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const normal = (t: string) => sinHuecos(t.trim()).replace(/\s+/g, " ");

/* Solo la guía que lee el vendedor: lo demás de la respuesta (los hallazgos, el ajuste al objetivo, las preguntas para el
   vendedor con sus opciones, las sesiones por equipo) no se toca, y tampoco los identificadores (`para`, `tipo`, `abierto`),
   que deciden a qué tarjeta o dimensión apunta cada cosa (revisión del 2026-11-08). */
const RAIZ_DE_LA_GUIA = new Set(["objetivo", "claves", "bloques", "fraseDeDemo"]);
const CLAVES_DE_TEXTO = new Set(["objetivo", "claves", "titulo", "abre", "guia", "profundizar", "impacto", "que", "preguntas", "fraseDeDemo"]);

/** Recorre los textos de la guía (con su clave) y devuelve el input con cada uno cambiado por `f`. */
function recorrer(x: unknown, f: (t: string) => string, clave: string | null = null, raiz = true): unknown {
  if (typeof x === "string") return clave && CLAVES_DE_TEXTO.has(clave) ? f(x) : x;
  if (Array.isArray(x)) return x.map((y) => recorrer(y, f, clave, false));
  if (esObjeto(x)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, raiz && !RAIZ_DE_LA_GUIA.has(k) ? v : recorrer(v, f, k, false)]));
  return x;
}

/** Cada texto de la guía, en orden. */
function hojas(input: unknown): string[] {
  const out: string[] = [];
  recorrer(input, (t) => (out.push(t), t));
  return out;
}

function inputDeLaGuia(respuesta: Anthropic.Messages.Message): unknown {
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_DE_LA_GUIA);
  return bloque && bloque.type === "tool_use" ? bloque.input : null;
}

/**
 * Los textos de la respuesta que hay que reescribir: los que tienen alguna de las palabras en voseo que se encontraron, y
 * los que no cumplen (preguntas cerradas o dobles, espacios por completar), tal como salieron del agente. La lectura de la
 * guía puede recortar o cambiar los «[…]» por paréntesis: por eso se compara normalizado y por el comienzo.
 */
export function textosAArreglar(respuesta: Anthropic.Messages.Message, noCumplen: readonly string[], voseo: readonly string[]): string[] {
  const conVoseo = new Set(voseo);
  const malos = noCumplen.map(normal).filter(Boolean);
  const out: string[] = [];
  for (const t of new Set(hojas(inputDeLaGuia(respuesta)))) {
    if (!t.trim()) continue;
    const n = normal(t);
    const voseado = conVoseo.size > 0 && formasDeVoseo(t).some((w) => conVoseo.has(w));
    // Una pregunta doble la lectura la parte en dos: lo que no cumple puede ser una de sus mitades.
    const piezas = [n, ...partirPreguntaDoble(n).map(normal)];
    const noCumple = malos.some((m) => piezas.some((p) => p === m || (m.length >= 20 && p.startsWith(m)) || (p.length >= 20 && m.startsWith(p))));
    if (voseado || noCumple) out.push(t);
    if (out.length >= MAX_TEXTOS_A_ARREGLAR) break;
  }
  return out;
}

/** El pedido chico: los textos numerados y las reglas de la guía. Nada del contexto del cliente: solo se corrige la forma. */
export function pedidoDelArreglo(textos: readonly string[]): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model: MODELO_DE_LA_GUIA,
    max_tokens: 3000,
    system:
      "Corriges textos de la guía que un vendedor de Smarteam lee en voz alta en una reunión de preventa con un cliente. " +
      "Reescribe cada texto cumpliendo estas reglas: (1) en tuteo, nunca en voseo (escribe «vives», «puedes», «cuéntame», «para ti»); " +
      "(2) si es una pregunta, abierta (que no se responda con sí, no o un número: «Cuéntame cómo…», «¿Cómo deciden…?», «¿Qué pasa cuando…?») y de una sola cosa (un solo signo de pregunta, sin una segunda pegada con «, y qué…»); " +
      "(3) sin espacios por completar como «[…]»: escrito para decirse tal cual. " +
      "Mantén el sentido, el tema, el largo y el tono; no agregues datos ni nombres nuevos. Un texto que ya cumple se devuelve igual. " +
      `Devuelve todos los textos con su número usando la herramienta ${HERRAMIENTA_DEL_ARREGLO}.`,
    tools: [
      {
        name: HERRAMIENTA_DEL_ARREGLO,
        description: "Los textos reescritos, cada uno con el número que traía.",
        input_schema: {
          type: "object",
          properties: {
            textos: {
              type: "array",
              items: {
                type: "object",
                properties: { n: { type: "integer" }, texto: { type: "string" } },
                required: ["n", "texto"],
              },
            },
          },
          required: ["textos"],
        },
      },
    ],
    tool_choice: { type: "tool", name: HERRAMIENTA_DEL_ARREGLO },
    messages: [{ role: "user", content: textos.map((t, i) => `${i + 1}. ${t}`).join("\n") }],
  };
}

/** Lo que devolvió el arreglo: texto original → reescrito. Solo los números que existen y los textos no vacíos. */
export function leerElArreglo(respuesta: Anthropic.Messages.Message, textos: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_DEL_ARREGLO);
  if (!bloque || bloque.type !== "tool_use" || !esObjeto(bloque.input) || !Array.isArray(bloque.input.textos)) return out;
  for (const x of bloque.input.textos) {
    if (!esObjeto(x) || typeof x.n !== "number" || typeof x.texto !== "string") continue;
    const original = textos[x.n - 1];
    const nuevo = x.texto.trim().slice(0, MAX_LARGO);
    if (original === undefined || !nuevo) continue;
    out.set(original, nuevo);
  }
  return out;
}

/** La misma respuesta del agente con los textos reescritos: se lee con `leerLaGuiaDelAgente` como cualquier otra. */
export function aplicarElArreglo(respuesta: Anthropic.Messages.Message, cambios: ReadonlyMap<string, string>): Anthropic.Messages.Message {
  if (!cambios.size) return respuesta;
  return {
    ...respuesta,
    content: respuesta.content.map((b) =>
      b.type === "tool_use" && b.name === HERRAMIENTA_DE_LA_GUIA ? { ...b, input: recorrer(b.input, (t) => cambios.get(t) ?? t) } : b,
    ),
  };
}
