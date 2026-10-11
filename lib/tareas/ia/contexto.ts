/**
 * lib/tareas/ia/contexto.ts — el CONTEXTO de las propuestas que salen de las notas de una reunión (nivel 1). PURO.
 *
 * Elías, 2026-10-09: «Cada tarea que se genera debe tener una descripción con contexto». Las notas de Gemini dicen
 * «[Lidia Flores] Revisar los copies: …», y el título solo no le dice a quien la recibe para qué es. Esta llamada es
 * APARTE de la que decide de quién es cada línea (ia/pedido.ts): solo escribe, por línea, de una a tres frases con lo
 * que dicen las notas (el resumen y los detalles). No decide nada: si la respuesta no sirve, cada línea se queda con el
 * contexto de respaldo que arma el código (lib/tareas/contexto-de-tarea.ts).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { limpiarContexto } from "../contexto-de-tarea";

export const MODELO_DEL_CONTEXTO = "claude-haiku-4-5";
export const HERRAMIENTA_DEL_CONTEXTO = "escribir_contextos";
export const SEGUNDOS_DEL_CONTEXTO = 20;

/** Cuántas líneas van en una llamada: más largas se cortan, y una respuesta cortada no se usa. */
export const LINEAS_POR_LLAMADA = 12;

/** ~125 tokens de texto (400 caracteres) más la clave y un margen, por línea. */
export function maxTokensDelContexto(lineas: number): number {
  return 250 + 170 * lineas;
}

export interface PedidoDeContextos {
  titulo: string;
  fecha: string;
  /** El resumen de las notas (hasta 2.000 caracteres). */
  resumen: string;
  /** Los párrafos de «Detalles» (se recortan juntos a 4.000). */
  detalles: string[];
  lineas: { ref: string; titulo: string; texto: string }[];
}

const SYSTEM = `Eres el asistente de tareas internas de Smarteam. De una reunión del equipo salieron tareas, y cada una necesita su CONTEXTO: lo que lee quien la recibe para entenderla sin haber estado.

Por cada línea escribe «contexto»: de una a tres frases (como mucho 400 caracteres) que dicen para qué es, para quién (el cliente o el equipo) y qué se espera, SOLO con lo que dicen las notas.
Reglas:
- No repitas el título: agrega lo que el título no dice.
- Usa SOLO lo que las notas dicen de ESA tarea. No menciones otros clientes, personas de afuera ni temas de la reunión que no sean de esa línea.
- No inventes fechas, montos, nombres ni compromisos que las notas no digan. Si las notas no dicen nada más, una sola frase con lo que se sabe.
- En español neutro, impersonal o en tercera persona («Hay que…», «Lidia lo necesita para…»). Nunca voseo.
- Usa SOLO las claves L# que te dan.`;

function recortarJuntos(textos: readonly string[], tope: number): string {
  const salida: string[] = [];
  let largo = 0;
  for (const t of textos) {
    if (largo + t.length > tope) break;
    salida.push(t);
    largo += t.length + 1;
  }
  return salida.join("\n");
}

export function pedidoDeContextos(p: PedidoDeContextos): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const partes: string[] = [`Reunión: «${p.titulo}» · ${p.fecha}`];
  if (p.resumen.trim()) partes.push(`\nRESUMEN\n${p.resumen.trim()}`);
  const detalles = recortarJuntos(p.detalles, 4_000);
  if (detalles) partes.push(`\nDETALLES\n${detalles}`);
  partes.push(`\nLÍNEAS (las tareas que salieron)\n${p.lineas.map((l) => `${l.ref} «${l.titulo}» — ${l.texto}`).join("\n")}`);

  const herramienta: Anthropic.Messages.Tool = {
    name: HERRAMIENTA_DEL_CONTEXTO,
    description: "Devuelve el contexto de cada línea: para qué es, para quién y qué se espera, con lo que dicen las notas.",
    input_schema: {
      type: "object",
      properties: {
        contextos: {
          type: "array",
          items: {
            type: "object",
            properties: { L: { type: "string", enum: p.lineas.map((l) => l.ref) }, contexto: { type: "string" } },
            required: ["L", "contexto"],
          },
        },
      },
      required: ["contextos"],
    } as Anthropic.Messages.Tool.InputSchema,
  };

  return {
    model: MODELO_DEL_CONTEXTO,
    max_tokens: maxTokensDelContexto(p.lineas.length),
    temperature: 0,
    system: SYSTEM,
    tools: [herramienta],
    tool_choice: { type: "tool", name: HERRAMIENTA_DEL_CONTEXTO },
    messages: [{ role: "user", content: partes.join("\n") }],
  };
}

/**
 * El contexto válido de cada línea (L# → texto). Una respuesta cortada no se usa entera: cada línea se queda con su
 * respaldo. Uno en voseo, que repite el título o vacío, tampoco.
 */
export function leerContextos(
  respuesta: Pick<Anthropic.Messages.Message, "content" | "stop_reason">,
  titulos: ReadonlyMap<string, string>,
): Map<string, string> {
  const salida = new Map<string, string>();
  if (respuesta.stop_reason === "max_tokens") return salida;
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_DEL_CONTEXTO);
  if (!bloque || bloque.type !== "tool_use") return salida;
  const lista = (bloque.input as { contextos?: unknown } | null)?.contextos;
  for (const crudo of Array.isArray(lista) ? lista : []) {
    if (!crudo || typeof crudo !== "object") continue;
    const x = crudo as { L?: unknown; contexto?: unknown };
    if (typeof x.L !== "string" || !titulos.has(x.L) || salida.has(x.L)) continue;
    const c = limpiarContexto(x.contexto, titulos.get(x.L)!);
    if ("contexto" in c) salida.set(x.L, c.contexto);
  }
  return salida;
}
