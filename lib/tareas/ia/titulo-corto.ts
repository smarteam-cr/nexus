/**
 * lib/tareas/ia/titulo-corto.ts — el pedido a la IA que escribe el nombre corto de las tareas, y su lectura (2026-10-20,
 * decisión de Elías). PURO.
 *
 * Un solo pedido por tanda (hasta `TANDA` tareas), con Haiku y una herramienta: por cada tarea, un nombre de 3 a 6
 * palabras que empieza por el verbo y dice qué hay que hacer. Sin el cliente (va adelante en el título del bloque), sin
 * fechas ni números de tarea. Lo que vuelve se valida acá: un id que no se pidió, un nombre vacío o largo, se descarta
 * (el largo se recorta sin cortar una palabra). Lo que no vuelve se queda con el recorte del título.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { recortarA, TOPE_TOLERADO } from "@/lib/tareas/titulo-corto";

export const MODELO_DEL_TITULO_CORTO = "claude-haiku-4-5-20251001";
export const SLUG_DEL_TITULO_CORTO = "titulo-corto-de-tareas";
export const HERRAMIENTA_DEL_TITULO_CORTO = "nombres_cortos";
/** Cuántas tareas van en un pedido. */
export const TANDA = 40;
/** Lo que llega del título al modelo: el nombre corto sale de la primera frase. */
const TOPE_DEL_TITULO = 240;

export interface TareaParaNombrar {
  id: string;
  titulo: string;
  /** El cliente, para que el nombre NO lo repita. */
  empresa: string | null;
}

const SYSTEM = [
  "Escribes el nombre corto de tareas de un equipo de consultoría de HubSpot, en español.",
  "El nombre corto aparece en un calendario y en una lista, al lado del nombre del cliente.",
  "Reglas:",
  "- De 3 a 7 palabras, como mucho 48 caracteres.",
  "- Español natural, con sus artículos y preposiciones: «Enviar el resumen a Miroslava», no «Enviar resumen sesión a Miroslava».",
  "- Empieza por el verbo en infinitivo y dice qué hay que hacer. «Recordarle a X que haga Y» se resume como «Pedirle a X el Y».",
  "- Conserva el nombre de la persona o del objeto que la distingue, si lo hay.",
  "- Una frase completa: nunca termina en una palabra que la deja colgando («…del primer», «…para la»).",
  "- Sin el nombre del cliente (ya va adelante), sin fechas ni días, sin números de tarea, sin comillas ni punto final.",
  "- Si el título ya es corto y claro, déjalo casi igual.",
  "- No inventes nada que no diga el título.",
  "Ejemplos:",
  "- «Recordarle a Ana que envíe el archivo de inventario actualizado (Sensa, Decton…)» → «Pedirle a Ana el inventario actualizado»",
  "- «Seguimiento con Iberorutas: 2 cosas que prometió el cliente (lun 19 oct)» → «Dar seguimiento a lo que prometió el cliente»",
  "- «Agendar la sesión específica de e-commerce invitando a Álvaro para analizar la operativa» → «Agendar la sesión de e-commerce con Álvaro»",
  "Responde siempre con la herramienta, una entrada por tarea, con el mismo id.",
].join("\n");

export function pedidoDeTitulosCortos(tareas: readonly TareaParaNombrar[]): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const herramienta: Anthropic.Messages.Tool = {
    name: HERRAMIENTA_DEL_TITULO_CORTO,
    description: "Registra el nombre corto de cada tarea.",
    input_schema: {
      type: "object",
      properties: {
        nombres: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, corto: { type: "string" } },
            required: ["id", "corto"],
          },
        },
      },
      required: ["nombres"],
    } as Anthropic.Messages.Tool.InputSchema,
  };
  const lista = tareas
    .map((t) => `- id: ${t.id}${t.empresa ? ` · cliente: ${t.empresa}` : ""}\n  título: ${t.titulo.replace(/\s+/g, " ").trim().slice(0, TOPE_DEL_TITULO)}`)
    .join("\n");
  return {
    model: MODELO_DEL_TITULO_CORTO,
    max_tokens: Math.min(5_000, 400 + tareas.length * 70),
    temperature: 0,
    system: SYSTEM,
    tools: [herramienta],
    tool_choice: { type: "tool", name: HERRAMIENTA_DEL_TITULO_CORTO },
    messages: [{ role: "user", content: `Tareas:\n${lista}` }],
  };
}

/** El nombre que vuelve, limpio: sin comillas ni punto final, y recortado si se pasó del tope. null si no sirve. */
export function limpiarNombreCorto(corto: unknown): string | null {
  if (typeof corto !== "string") return null;
  const limpio = corto
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[«"'“]+|[»"'”.]+$/gu, "")
    .trim();
  if (!limpio) return null;
  return limpio.length > TOPE_TOLERADO ? recortarA(limpio, TOPE_TOLERADO) || null : limpio;
}

/** Los nombres de la respuesta, solo de las tareas pedidas. Mapa vacío si la respuesta no trae la herramienta o se cortó. */
export function leerTitulosCortos(respuesta: Pick<Anthropic.Messages.Message, "content" | "stop_reason">, pedidas: readonly TareaParaNombrar[]): Map<string, string> {
  const out = new Map<string, string>();
  if (respuesta.stop_reason === "max_tokens") return out;
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_DEL_TITULO_CORTO);
  if (!bloque || bloque.type !== "tool_use") return out;
  const nombres = (bloque.input as { nombres?: unknown } | null)?.nombres;
  if (!Array.isArray(nombres)) return out;
  const ids = new Set(pedidas.map((t) => t.id));
  for (const n of nombres) {
    const id = (n as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !ids.has(id) || out.has(id)) continue;
    const corto = limpiarNombreCorto((n as { corto?: unknown }).corto);
    if (corto) out.set(id, corto);
  }
  return out;
}
