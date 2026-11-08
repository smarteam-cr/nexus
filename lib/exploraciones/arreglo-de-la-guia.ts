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
import { sinHuecos } from "./agenda";
import { HERRAMIENTA_DE_LA_GUIA, MODELO_DE_LA_GUIA } from "./guia-pedido";

export const HERRAMIENTA_DEL_ARREGLO = "reescribir_textos";
/** Tope de textos por arreglo: más que esto es una guía mala entera, y se queda la mejor de las dos igual. */
export const MAX_TEXTOS_A_ARREGLAR = 30;
const MAX_LARGO = 600;

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const normal = (t: string) => sinHuecos(t.trim()).replace(/\s+/g, " ");

/** Cada texto (hoja de tipo string) del input de la herramienta, en orden y sin repetir. */
function hojas(x: unknown, out: string[] = []): string[] {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) x.forEach((y) => hojas(y, out));
  else if (esObjeto(x)) Object.values(x).forEach((y) => hojas(y, out));
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
    const noCumple = malos.some((m) => n === m || (m.length >= 20 && n.startsWith(m)) || (n.length >= 20 && m.startsWith(n)));
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

function reemplazar(x: unknown, cambios: ReadonlyMap<string, string>): unknown {
  if (typeof x === "string") return cambios.get(x) ?? x;
  if (Array.isArray(x)) return x.map((y) => reemplazar(y, cambios));
  if (esObjeto(x)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, reemplazar(v, cambios)]));
  return x;
}

/** La misma respuesta del agente con los textos reescritos: se lee con `leerLaGuiaDelAgente` como cualquier otra. */
export function aplicarElArreglo(respuesta: Anthropic.Messages.Message, cambios: ReadonlyMap<string, string>): Anthropic.Messages.Message {
  if (!cambios.size) return respuesta;
  return {
    ...respuesta,
    content: respuesta.content.map((b) =>
      b.type === "tool_use" && b.name === HERRAMIENTA_DE_LA_GUIA ? { ...b, input: reemplazar(b.input, cambios) } : b,
    ),
  };
}
