/**
 * lib/handoff/propuesta-de-resultados.ts — el PEDIDO a la IA para proponer los resultados que
 * persigue el cliente desde las reuniones, cuando el handoff no los escribió. PURO (sin base, sin red).
 *
 * La lista es UNA sola (`Project.handoffResultados`, lib/handoff/resultados-medibles.ts). Lo normal es
 * que salga de la sección «Resultados que el cliente necesita alcanzar» del handoff
 * (lib/handoff/resultados.ts). Pero los handoffs de antes de que el prompt la pidiera la tienen vacía:
 * para esos —y para el relleno hacia atrás de las cuentas activas— la IA la propone desde el handoff,
 * la ficha del cliente, la encuesta y las reuniones del proyecto. En los dos casos la confirma el CSE.
 *
 * La política de Smarteam es «resultados, no proyectos»: el cliente pide un pipeline; el resultado es
 * que su gerente decide con datos. Por eso cada resultado dice QUIÉN lo necesita y qué lo frena.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ResultadoMedible } from "./resultados-medibles";

export const MAX_RESULTADOS = 5;
export const MODELO_RESULTADOS = "claude-sonnet-4-6";

export interface FuenteDeResultados {
  /** Id corto que el modelo cita: H1, S3, F1, E1. */
  id: string;
  etiqueta: string;
  texto: string;
}

/** Lo que se propone: un resultado de la lista, todavía sin R (lo pone la fusión) ni confirmación. */
export type ResultadoPropuesto = Omit<ResultadoMedible, "id" | "editadoAt" | "editadoPor" | "confirmadoAt" | "confirmadoPor">;

const PROMPT = `Eres un consultor senior de Smarteam (implementa HubSpot). Tu trabajo es identificar el RESULTADO DE NEGOCIO que persigue el cliente con este proyecto. La política de Smarteam es «resultados, no proyectos»: el resultado es el criterio de éxito de la implementación.

LA DIFERENCIA QUE IMPORTA:
- Lo que el cliente PIDE es un entregable: «un pipeline», «automatizar correos», «un dashboard».
- El RESULTADO es lo que tiene que pasar en su negocio gracias a eso: «la gerente comercial decide en qué canal invertir con datos de conversión», «el equipo responde un lead en menos de 2 horas».
- Ejemplo: el cliente dice que quiere un pipeline, pero el resultado es que su jefa necesita un reporte para decidir. Ahí el resultado es el reporte para decidir; el pipeline es el medio.

POR CADA RESULTADO (entre 1 y 5, solo los que las fuentes sostienen):
- resultado: una frase con lo que tiene que pasar en el negocio. Nunca un entregable.
- quienLoNecesita: la persona y su rol en el cliente («Ana Pérez, gerente comercial»). Si no se nombró, el rol. Nunca alguien de Smarteam.
- metrica: con qué se va a saber que pasó (una tasa, un tiempo, un monto, una cantidad). Vacío si no se puede medir con un número.
- lineaBase y meta: SOLO si alguien las dijo; si no, vacías (Nexus las muestra «Por validar»). NUNCA inventes un número.
- plazo: para cuándo, si se dijo.
- retos: lo que HOY le impide llegar a ese resultado (datos dispersos, falta de adopción, un proceso manual, una decisión pendiente). Concretos, sacados de las fuentes.
- fuentes: los ids de las fuentes que lo sostienen.

SEGÚN LA MODALIDAD DEL SERVICIO (te la dice el mensaje):
- FIN DEFINIDO: los resultados son HITOS con cierre — qué queda funcionando, desde cuándo y cómo se verifica.
- RECURRENTE: son METAS SOSTENIDAS, sin fecha de fin — el nivel de servicio que se mantiene mes a mes, la adopción que se sostiene o crece, y qué tiene que ser cierto para que el cliente renueve.

REGLAS DURAS:
- Solo lo que respalden las fuentes. Si no hay evidencia de ningún resultado, devuelve la lista vacía.
- Lo dicho [PUERTAS ADENTRO] es de Smarteam: sirve para entender, pero un resultado tiene que ser del CLIENTE.
- Escribe en español neutro, con tuteo (nunca voseo), frases cortas y sin jerga de gestión.`;

const TOOL: Anthropic.Messages.Tool = {
  name: "proponer_resultados",
  description:
    "Propone los resultados de negocio que persigue el cliente. Llámala una sola vez; con la lista vacía si las fuentes no muestran ninguno.",
  input_schema: {
    type: "object",
    properties: {
      resultados: {
        type: "array",
        maxItems: MAX_RESULTADOS,
        items: {
          type: "object",
          properties: {
            resultado: { type: "string" },
            quienLoNecesita: { type: "string" },
            metrica: { type: "string" },
            lineaBase: { type: "string" },
            meta: { type: "string" },
            plazo: { type: "string" },
            retos: { type: "array", items: { type: "string" } },
            fuentes: { type: "array", items: { type: "string" } },
          },
          required: ["resultado", "quienLoNecesita", "retos", "fuentes"],
        },
      },
    },
    required: ["resultados"],
  },
};

export function pedidoDeResultados(opts: {
  cliente: string;
  proyecto: string;
  /** El proyecto lleva el tag `recurrente`: los resultados son metas sostenidas, no hitos. */
  recurrente: boolean;
  fuentes: readonly FuenteDeResultados[];
  equipoSmarteam: readonly string[];
}): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const cuerpo = [
    `Cliente: ${opts.cliente}`,
    `Proyecto: ${opts.proyecto}`,
    `Modalidad del servicio: ${opts.recurrente ? "RECURRENTE (metas sostenidas)" : "FIN DEFINIDO (hitos con cierre)"}`,
    opts.equipoSmarteam.length ? `Gente de Smarteam (nunca son quienes necesitan el resultado): ${opts.equipoSmarteam.join(", ")}` : "",
    "",
    ...opts.fuentes.map((f) => `=== [${f.id}] ${f.etiqueta} ===\n${f.texto}`),
  ]
    .filter((l) => l !== "")
    .join("\n\n");
  return {
    model: MODELO_RESULTADOS,
    max_tokens: 4000,
    system: PROMPT,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: cuerpo }],
  };
}

const texto = (v: unknown, max = 400): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Lee la respuesta: solo las fuentes que existen, y nunca a alguien del equipo como quien lo necesita.
 * Lo vacío no se guarda (la lista lo muestra «Por validar»).
 */
export function leerPropuestaDeResultados(
  respuesta: Anthropic.Messages.Message,
  fuentes: readonly FuenteDeResultados[],
  equipoSmarteam: readonly string[],
): ResultadoPropuesto[] {
  const uso = respuesta.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
  if (!uso) return [];
  const crudos = (uso.input as { resultados?: unknown })?.resultados;
  if (!Array.isArray(crudos)) return [];
  const ids = new Set(fuentes.map((f) => f.id));
  const equipo = equipoSmarteam.map((n) => n.toLowerCase()).filter((n) => n.length >= 4);
  const salida: ResultadoPropuesto[] = [];
  for (const c of crudos) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    const resultado = texto(r.resultado);
    if (!resultado) continue;
    const quien = texto(r.quienLoNecesita, 300);
    const retos = Array.isArray(r.retos) ? r.retos.map((x) => texto(x, 300)).filter(Boolean).slice(0, 6) : [];
    const citadas = Array.isArray(r.fuentes) ? r.fuentes.map((x) => texto(x, 12)).filter((id) => ids.has(id)).slice(0, 8) : [];
    salida.push({
      resultado,
      metrica: texto(r.metrica),
      lineaBase: texto(r.lineaBase),
      meta: texto(r.meta),
      plazo: texto(r.plazo, 120),
      ...(quien && !equipo.some((n) => quien.toLowerCase().includes(n)) ? { quienLoNecesita: quien } : {}),
      ...(retos.length ? { retos } : {}),
      ...(citadas.length ? { fuentes: citadas } : {}),
    });
    if (salida.length >= MAX_RESULTADOS) break;
  }
  return salida;
}
