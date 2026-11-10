/**
 * lib/exploraciones/orden-pedido.ts — el pedido al agente que ORDENA la lista entera de casos de uso de la preventa, y
 * su lectura. PURO (sin base ni red): lo usan orden-de-los-casos.ts, el simulacro y las pruebas.
 *
 * Pedido de Elías (2026-11-08, décima vuelta, con Centauro Solutions): todos los casos del paso (los elegidos, los que
 * sugirió el agente y los de la biblioteca que sugiere la escala) en UNA lista, uno por fila, en el orden que sugiere el
 * agente «con todo lo que Nexus sabe de la empresa»: la escala, sus reuniones (las minutas, del chokepoint de sesiones),
 * el objetivo de la exploración y el contexto adicional del vendedor. Va en la misma vuelta que «Sugerir» o «Revisar»,
 * en una llamada aparte: la que sugiere escribe lo que ve el cliente y no lee lo interno; esta sí (solo dice el orden y
 * su porqué, para el vendedor, y el título claro de los de la biblioteca, que sale de su ficha).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { REGLAS_DEL_TITULO, validarOrdenDelAgente, type CandidatoAlOrden, type OrdenDeLosCasos } from "@/lib/casos-de-uso/orden";
import { REGLAS_DE_LA_CASA } from "@/lib/casos-de-uso/capas";
import { MODELO_DE_LA_EXPLORACION } from "./agente-pedido";

export const NOMBRE_DE_LA_HERRAMIENTA_DEL_ORDEN = "ordenar_casos";

export interface ContextoDelOrden {
  empresa: string;
  /** El objetivo de la exploración: el de Smarteam y su ajuste para esta empresa. */
  objetivo: string;
  /** Dónde parece estar cada equipo y lo que se sabe (lo mismo que lee el que sugiere). */
  exploracion: string;
  /** Lo interno de la preventa: lo que dijo cada reunión, los hallazgos, «Lo que ya sabemos». */
  interno: string;
  /** Las minutas de sus reuniones más recientes (del chokepoint de sesiones). */
  reuniones: string;
  /** La lectura del consultor (o sus instrucciones de antes), ya como bloque, o "". */
  instrucciones: string;
  candidatos: CandidatoAlOrden[];
  /** 2026-11-09 (lib/casos-de-uso/capas.ts): cómo está la casa de cada área, en una o dos frases. */
  casa?: string;
  /** Qué hace la empresa: el título claro de los de la biblioteca se puede armar con su negocio. */
  negocio?: string;
}

const ETIQUETA: Record<CandidatoAlOrden["origen"], string> = { elegido: "elegido por el vendedor", agente: "sugerido por el agente", escala: "biblioteca" };

export function pedidoDelOrden(ctx: ContextoDelOrden): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const tool: Anthropic.Messages.Tool = {
    name: NOMBRE_DE_LA_HERRAMIENTA_DEL_ORDEN,
    description: "El orden de todos los casos de la lista, del primero al último. Llámala una sola vez.",
    input_schema: {
      type: "object",
      properties: {
        orden: {
          type: "array",
          description: "TODOS los casos de la lista, cada uno una vez, en orden: el primero es el que más le conviene a esta empresa ahora.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", enum: ctx.candidatos.map((c) => c.id) },
              porQue: {
                type: "string",
                description: "Para el vendedor, UNA frase de 20 palabras como mucho: por qué va en este lugar, con un hecho de esta empresa (lo que contó, su meta, lo que la frena).",
              },
              titulo: {
                type: "string",
                description:
                  "SOLO en los de la «biblioteca»: su título claro con las reglas del TÍTULO, el mismo resultado de su ficha. Lo puede ver el cliente: solo con lo que dice el caso en la lista, sin nombres, cifras ni nada interno. Vacío en los demás.",
              },
            },
            required: ["id", "porQue"],
          },
        },
      },
      required: ["orden"],
    },
  };
  const sistema = `Eres el analista de ventas de Smarteam, una consultora que implementa HubSpot. En la primera propuesta de un prospecto, el vendedor tiene una lista de casos de uso: los que ya eligió, los que sugirió el agente y los de la biblioteca que sugiere la escala. Ordénalos TODOS en una sola lista, del que más le conviene a esta empresa ahora al que menos. «porQue» lo lee solo el vendedor; «titulo» lo puede ver el cliente (abajo).

${REGLAS_DE_LA_CASA}${ctx.casa ? `\nHoy: ${ctx.casa}` : ""}
- Un caso que se apoya en otro, o que lo alimenta (dice «se apoya en» o «alimenta» en la lista), va después de él.

Dentro de eso, cómo ordenar, en este orden de peso:
1. Lo que frena a cada área en la escala (sus dimensiones más bajas) y la base que los demás casos necesitan van antes.
2. Lo que toca un dolor o una meta que el cliente dijo en sus reuniones, con un hecho suyo.
3. El objetivo de la exploración y las instrucciones del vendedor, si las hay.
4. Lo que el cliente pueda sostener: una primera venta chica y clara antes que una grande.
- Un caso elegido no va primero por estar elegido: va donde le toca.
- Si dos casos se pisan (resuelven lo mismo), el más completo para esta empresa va antes y el otro después; no quites ninguno.
- «porQue» nombra el hecho de la empresa que lo pone ahí, en palabras simples. Sin cifras que no estén escritas abajo. Nada de opiniones sobre personas.
- «titulo» solo en los de la «biblioteca»: su título del catálogo, escrito de nuevo si no cumple las reglas del TÍTULO (si ya las cumple, vacío). En los demás, siempre vacío. ⚠ Ese título SÍ lo puede ver el cliente (si el vendedor elige el caso, va a su propuesta): escríbelo SOLO con lo que dice el caso en la lista (su título y lo que resuelve), nunca con lo interno ni con las reuniones: sin nombres de personas, sin cifras, sin opiniones, sin nada que el cliente no haya visto.

${REGLAS_DEL_TITULO}`;
  const conexiones = (c: CandidatoAlOrden) =>
    (c.conexiones ?? []).map((x) => `${x.tipo === "alimenta" ? "alimenta" : "se apoya en"} [${x.con}]`).join(", ");
  const lista = ctx.candidatos
    .map(
      (c) =>
        `- [${c.id}] «${c.titulo}» (${ETIQUETA[c.origen]}${c.area ? `; área ${c.area}` : ""}${c.capa ? `; capa ${c.capa}` : ""}${conexiones(c) ? `; ${conexiones(c)}` : ""})${c.queResuelve ? `. ${c.queResuelve}` : ""}`,
    )
    .join("\n");
  const cuerpo =
    `Empresa: ${ctx.empresa}\n\n` +
    (ctx.instrucciones ?? "") +
    (ctx.negocio ? `=== SU NEGOCIO ===\n${ctx.negocio}\n\n` : "") +
    `=== EL OBJETIVO DE LA EXPLORACIÓN ===\n${ctx.objetivo || "(sin ajuste)"}\n\n` +
    `=== DÓNDE ESTÁ CADA EQUIPO Y LO QUE SE SABE ===\n${ctx.exploracion || "(nada)"}\n\n` +
    `=== LO QUE SE SABE (interno) ===\n${ctx.interno || "(nada)"}\n\n` +
    `=== SUS REUNIONES MÁS RECIENTES (minutas) ===\n${ctx.reuniones || "(ninguna con minuta)"}\n\n` +
    `=== LA LISTA (ordénalos todos) ===\n${lista}`;
  return {
    model: MODELO_DE_LA_EXPLORACION,
    // Hasta 40 casos, unos 50 tokens cada uno (id, una frase y, en los de la biblioteca, el título).
    max_tokens: 3500,
    system: sistema,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: cuerpo }],
  };
}

/** Lo que devolvió, validado (`validarOrdenDelAgente`): null si no ordenó ninguno. */
export function leerElOrden(respuesta: Anthropic.Messages.Message, ctx: Pick<ContextoDelOrden, "candidatos" | "negocio">, corridaId: string, ahora = new Date()): OrdenDeLosCasos | null {
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === NOMBRE_DE_LA_HERRAMIENTA_DEL_ORDEN);
  const x = bloque && bloque.type === "tool_use" && typeof bloque.input === "object" && bloque.input !== null ? (bloque.input as Record<string, unknown>) : {};
  return validarOrdenDelAgente(x.orden, ctx.candidatos, corridaId, ahora, { negocio: ctx.negocio });
}
