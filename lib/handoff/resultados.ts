/**
 * lib/handoff/resultados.ts — lee «Resultados que el cliente necesita alcanzar» del handoff y lo
 * guarda como LISTA de resultados medibles (2026-10-02). SERVIDOR.
 *
 * Por qué y con qué forma: lib/handoff/resultados-medibles.ts. Acá solo la lectura y el guardado.
 *
 * ── LAS PUERTAS ──────────────────────────────────────────────────────────────
 *  · AUTOMÁTICA — cada corrida del agente de handoff (analyze/route.ts), fire-and-forget, como el
 *    resumen de tres frases: el handoff cambió, así que su lista también.
 *  · El DIAGNÓSTICO — si al generarlo el proyecto todavía no tiene la lista (un handoff de antes de
 *    esto), la lee primero: sus objetivos cuantitativos la necesitan.
 *  · MANUAL — «Releer del handoff», en la lista del handoff.
 *
 * ── LO QUE NO HACE ───────────────────────────────────────────────────────────
 * No lee sesiones: lee la sección YA ESCRITA del handoff. Sacar los resultados de la fuente daría una
 * lista que contradice al handoff sin que nadie sepa por qué. Y no inventa: si el texto no da una
 * línea base, queda vacía (= por validar).
 *
 * Si el handoff NO tiene la sección escrita (los handoffs de antes de que el prompt la pidiera), la
 * lista la propone la IA desde las reuniones del proyecto: `lib/handoff/proponer-resultados.ts`
 * (`leerOProponerResultados`). Venga de donde venga, la confirma el CSE.
 *
 * ⚠ No tira nunca: la corrida del handoff no puede fallar porque esto no salió.
 */
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { HANDOFF_SECCION_PRINCIPAL } from "@/lib/canvas/canvas-defs";
import {
  fusionarResultados,
  leerRespuestaDeResultados,
  leerResultadosDelHandoff,
  type ResultadoMedible,
  type ResultadosDelHandoff,
} from "./resultados-medibles";

/** Una extracción corta y literal: el esfuerzo bajo alcanza (pide copiar, no razonar). */
export const RESULTADOS_HANDOFF_MODEL = "claude-opus-5-5";

const MAX_CARACTERES_SECCION = 16_000;

const SYSTEM = [
  "Eres el analista de Customer Success de Smarteam, una consultora de HubSpot en Costa Rica.",
  "Conviertes la sección de un documento interno en una lista estructurada, sin agregar nada.",
  "Español de Costa Rica, en tuteo. NUNCA voseo.",
].join(" ");

/** La instrucción, separada para leerla y testearla sin el modelo. */
export const INSTRUCCION_RESULTADOS = [
  "Arriba está la sección «Resultados que el cliente necesita alcanzar» del handoff de un proyecto.",
  "Devuelve cada resultado que nombra como un elemento de `resultados`, en el mismo orden:",
  "- `resultado`: qué tiene que pasar en el negocio del cliente, en una frase.",
  "- `metrica`: cómo se va a saber que pasó (la señal o la métrica). Vacío si el texto no lo dice.",
  "- `lineaBase`: el punto de partida, SOLO si el texto da un número o un estado concreto de hoy. Si no, vacío.",
  "- `meta`: a dónde se quiere llegar, SOLO si el texto la da. Si no, vacío.",
  "- `plazo`: para cuándo, si el texto lo dice. Si no, vacío.",
  "- `quienLoNecesita`: la persona y su rol en el cliente que necesita ese resultado, si el texto lo dice. Si no, vacío. Nunca alguien de Smarteam.",
  "- `retos`: lo que hoy le impide llegar a ese resultado, si el texto lo dice (uno por elemento). Si no, lista vacía.",
  "",
  "Reglas:",
  "- Usa SOLO lo que dice el texto. Un número que no está escrito no existe: deja el campo vacío.",
  "- «⚠️ Por validar…» o «por definir» en el texto = campo vacío.",
  "- Un resultado por elemento; no partas uno en dos ni juntes dos en uno.",
  "- Si la sección no nombra ningún resultado, devuelve `resultados` vacío.",
].join("\n");

const ESQUEMA = {
  type: "object",
  properties: {
    resultados: {
      type: "array",
      items: {
        type: "object",
        properties: {
          resultado: { type: "string" },
          metrica: { type: "string" },
          lineaBase: { type: "string" },
          meta: { type: "string" },
          plazo: { type: "string" },
          quienLoNecesita: { type: "string" },
          retos: { type: "array", items: { type: "string" } },
        },
        required: ["resultado", "metrica", "lineaBase", "meta", "plazo", "quienLoNecesita", "retos"],
        additionalProperties: false,
      },
    },
  },
  required: ["resultados"],
  additionalProperties: false,
} as const;

export type LecturaDeResultados =
  | { status: "ok"; resultados: ResultadoMedible[] }
  /** El handoff no tiene la sección escrita: no hay qué leer, y no es un error. */
  | { status: "sin_texto" }
  | { status: "error"; error: string };

/** La lista guardada del proyecto (o null). */
export async function resultadosDelProyecto(projectId: string): Promise<ResultadosDelHandoff | null> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { handoffResultados: true } });
  return leerResultadosDelHandoff(p?.handoffResultados);
}

/**
 * Lee la sección del handoff, la estructura con el modelo, la une con lo guardado (lo editado a mano
 * manda) y la guarda. No tira nunca.
 */
export async function estructurarResultadosDelHandoff(
  projectId: string,
  origen: ResultadosDelHandoff["origen"] = "handoff",
): Promise<LecturaDeResultados> {
  let seccion: string;
  try {
    seccion = await loadHandoffContext(projectId, { onlyConfirmed: false, includeKeys: [HANDOFF_SECCION_PRINCIPAL] });
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "no se pudo leer el handoff" };
  }
  if (!seccion || seccion.trim().length < 40) return { status: "sin_texto" };

  try {
    const msg = await anthropic.messages.create({
      model: RESULTADOS_HANDOFF_MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA as unknown as Record<string, unknown> } },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: seccion.slice(0, MAX_CARACTERES_SECCION) },
            { type: "text", text: `\n\n${INSTRUCCION_RESULTADOS}` },
          ],
        },
      ],
    });
    if (msg.stop_reason === "refusal") return { status: "error", error: "el modelo no quiso leer la sección" };
    if (msg.stop_reason === "max_tokens") return { status: "error", error: "la respuesta se cortó" };
    const texto = msg.content
      .map((b) => (b.type === "text" ? (b as { text: string }).text : ""))
      .join("")
      .trim();
    const leidos = leerRespuestaDeResultados(texto);
    if (!leidos) return { status: "error", error: "el modelo no devolvió una lista válida" };

    const previos = (await resultadosDelProyecto(projectId))?.resultados ?? [];
    const resultados = fusionarResultados(previos, leidos);
    const guardar: ResultadosDelHandoff = { version: 1, resultados, at: new Date().toISOString(), origen };
    await prisma.project.update({ where: { id: projectId }, data: { handoffResultados: guardar as object } });
    return { status: "ok", resultados };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "falló la lectura" };
  }
}
