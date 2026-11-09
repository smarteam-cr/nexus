/**
 * lib/exploraciones/mejorar-pedido.ts — el pedido al agente de «Mejorar con IA» de las actividades de un caso, y su
 * lectura. PURO (sin base ni red): lo usan mejorar-actividades.ts, el simulacro y las pruebas.
 *
 * Décima vuelta (2026-11-08, lib/casos-de-uso/mejorar.ts): el CSE escribe una instrucción en el momento y el agente deja
 * la lista de actividades como quedaría, con qué cambió y, si quedan cosas por fuera, actividades sugeridas aparte (de la
 * biblioteca o nuevas) con su porqué. Lee lo mismo que la personalización (el caso, su ficha, la biblioteca, lo que se
 * sabe de la empresa y las minutas de sus reuniones, del chokepoint de sesiones), más la instrucción, que manda.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ActividadDelCaso, ActividadLigera } from "@/lib/casos-de-uso/armado";
import { leerPropuestaDeMejora, MAX_SUGERIDAS, type PropuestaDeMejora } from "@/lib/casos-de-uso/mejorar";
import { actividadesParaElAgente, bibliotecaParaElAgente, MODELO_DE_LA_EXPLORACION } from "./agente-pedido";
import { idsPorNombres, type ContextoDePersonalizar } from "./personalizar-pedido";

export const NOMBRE_DE_LA_HERRAMIENTA_DE_MEJORAR = "mejorar_actividades";

export interface ContextoDeMejorar extends Omit<ContextoDePersonalizar, "actuales"> {
  /** Las actividades que tiene hoy el caso (las suyas o las de su ficha): de ahí se parte. */
  actuales: ActividadDelCaso[];
  /** Lo que pide el CSE, tal cual. */
  instruccion: string;
}

export function pedidoDeMejorar(ctx: ContextoDeMejorar): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const ids = ctx.biblioteca.map((a) => a.id);
  const actividad = {
    type: "object",
    properties: {
      actividadId: { type: "string", enum: ids },
      nombre: { type: "string", description: "Cómo se llama en este caso: la acción concreta («Conectar WhatsApp a la bandeja de Ventas»)." },
      veces: { type: "integer", minimum: 1, maximum: 20 },
      sobreQue: { type: "string", description: "De qué trata cuando se comparte por «sobre qué» («WhatsApp»). Vacío si no aplica." },
    },
    required: ["actividadId", "nombre", "veces"],
  };
  const tool: Anthropic.Messages.Tool = {
    name: NOMBRE_DE_LA_HERRAMIENTA_DE_MEJORAR,
    description: "Las actividades del caso como quedan con la instrucción del CSE, qué cambió y lo que sugieres aparte. Llámala una sola vez.",
    input_schema: {
      type: "object",
      properties: {
        actividades: { type: "array", description: "La lista COMPLETA como queda, SOLO actividades de la biblioteca. Lo que no cambia, igual que hoy.", items: actividad },
        cambios: {
          type: "array",
          items: { type: "string" },
          description: "De una a cuatro líneas, 15 palabras como mucho cada una: qué cambiaste y por qué, con el nombre de la actividad (nunca su id).",
        },
        sugeridas: {
          type: "array",
          description: `Hasta ${MAX_SUGERIDAS}: lo que con esta instrucción queda por fuera y conviene sumar. NO las metas en «actividades»: el CSE decide. Vacío si no falta nada.`,
          items: {
            type: "object",
            properties: {
              actividadId: { type: "string", enum: ["", ...ids], description: "La de la biblioteca, si hay una. Vacío si es una actividad NUEVA que ninguna cubre." },
              nombre: { type: "string", description: "La acción concreta, en pocas palabras." },
              sobreQue: { type: "string", description: "De qué trata, si se comparte por «sobre qué». Vacío si no aplica." },
              porQue: { type: "string", description: "UNA frase de 20 palabras como mucho: qué queda por fuera sin ella, con un hecho de la empresa si lo hay." },
            },
            required: ["actividadId", "nombre", "porQue"],
          },
        },
      },
      required: ["actividades", "cambios", "sugeridas"],
    },
  };
  const sistema = `Eres el analista de ventas de Smarteam, una consultora que implementa HubSpot. El vendedor está armando un caso de uso para la propuesta de un prospecto y te da una INSTRUCCIÓN para sus actividades. Lo que escribes lo lee el vendedor; el cliente no lo ve.

Reglas:
- La instrucción del vendedor MANDA: haz exactamente lo que pide (quitar, sumar, cambiar las veces) sobre las actividades que tiene HOY. Lo que la instrucción no toca, déjalo igual.
- «actividades» es la lista COMPLETA como queda, solo con actividades de la BIBLIOTECA (abajo), por su id: son el plan que ejecuta Customer Success y de ahí sale el precio.
- Si la instrucción pide algo que ninguna actividad de la biblioteca cubre (o un trabajo más grande que la actividad, como una integración con un ERP), NO lo fuerces en «actividades»: ponlo en «sugeridas» con «actividadId» vacío.
- «sugeridas» es lo que, con esta instrucción, queda por fuera y conviene sumar (por ejemplo: quitó la capacitación y nadie le enseña al equipo a usar lo nuevo). De la biblioteca si hay una; nueva si no. Cada una con su porqué. Nunca repitas una que ya está en la lista, y nunca vuelvas a sugerir lo que la instrucción pidió quitar: si quitarlo deja un riesgo, dilo en una línea de «cambios». Si no falta nada, vacío: no sugieras por sugerir.
- El nombre de cada actividad dice la acción concreta en este caso, SIN cambiarle lo que es: es la misma actividad de la biblioteca, con el mismo tiempo.
- En los textos, las actividades van por su NOMBRE, nunca por su id. Palabras simples. Sin cifras que no estén escritas abajo. Nada de opiniones sobre personas.`;
  const ficha = ctx.ficha ? `=== LA FICHA DEL CATÁLOGO ===\n${ctx.ficha.texto}\nActividades por defecto: ${actividadesParaElAgente(ctx.ficha.actividades) || "(ninguna)"}\n\n` : "";
  const cuerpo =
    `Empresa: ${ctx.empresa}\n\n` +
    `=== LA INSTRUCCIÓN DEL VENDEDOR (manda) ===\n${ctx.instruccion}\n\n` +
    `=== EL CASO ===\n${ctx.caso.titulo}${ctx.caso.area ? ` (área: ${ctx.caso.area})` : ""}\n${ctx.caso.descripcion}${ctx.caso.porQue ? `\nPor qué se propuso: ${ctx.caso.porQue}` : ""}\n\n` +
    `=== LAS ACTIVIDADES QUE TIENE HOY ===\n${actividadesParaElAgente(ctx.actuales) || "(ninguna)"}\n\n` +
    ficha +
    (ctx.instrucciones ?? "") +
    `=== LO QUE SE SABE (lo que puede ver el cliente) ===\n${ctx.exploracion || "(nada)"}\n\n` +
    `=== LO QUE SE SABE (interno) ===\n${ctx.interno || "(nada)"}\n\n` +
    `=== SUS REUNIONES MÁS RECIENTES (minutas) ===\n${ctx.reuniones || "(ninguna con minuta)"}\n\n` +
    `=== LA BIBLIOTECA DE ACTIVIDADES (las únicas que se pueden usar en «actividades») ===\n${bibliotecaParaElAgente(ctx.biblioteca)}`;
  return {
    model: MODELO_DE_LA_EXPLORACION,
    // La lista entera (~40 tokens por actividad, hasta unas 20), cuatro líneas y hasta cuatro sugeridas.
    max_tokens: 3500,
    system: sistema,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: cuerpo }],
  };
}

/** Lo que devolvió, validado (`leerPropuestaDeMejora`), con los ids que se colaron en los textos cambiados por su nombre. */
export function leerLaMejora(respuesta: Anthropic.Messages.Message, ctx: Pick<ContextoDeMejorar, "biblioteca" | "actuales">): PropuestaDeMejora {
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === NOMBRE_DE_LA_HERRAMIENTA_DE_MEJORAR);
  const x = bloque && bloque.type === "tool_use" && typeof bloque.input === "object" && bloque.input !== null ? (bloque.input as Record<string, unknown>) : {};
  const porId = new Map<string, ActividadLigera>(ctx.biblioteca.map((a) => [a.id, a]));
  const limpio = {
    ...x,
    cambios: Array.isArray(x.cambios) ? x.cambios.map((c) => idsPorNombres(c, ctx.biblioteca)) : x.cambios,
    sugeridas: Array.isArray(x.sugeridas)
      ? x.sugeridas.map((s) => (typeof s === "object" && s !== null ? { ...s, porQue: idsPorNombres((s as Record<string, unknown>).porQue, ctx.biblioteca) } : s))
      : x.sugeridas,
  };
  return leerPropuestaDeMejora(limpio, porId, ctx.actuales);
}
