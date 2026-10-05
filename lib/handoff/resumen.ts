/**
 * lib/handoff/resumen.ts — «¿QUÉ SE VENDIÓ?», EN TRES FRASES.
 *
 * ── EL PROBLEMA ──────────────────────────────────────────────────────────────
 * El handoff son **12 secciones**: alcance vendido, lo que quedó afuera, promesas, riesgos,
 * stakeholders, dolor, expectativas. Es el documento más importante del proyecto y también el
 * más largo — y la pregunta con la que todo el mundo lo abre («¿qué le vendimos a éste?») solo
 * se contestaba leyéndolo entero. En la práctica eso significa que no se contesta: se abre el
 * proyecto, se mira el widget, y el alcance vendido queda de oídas.
 *
 * Este módulo escribe esa respuesta corta y la deja guardada en el proyecto, para que la sección
 * la muestre sin que nadie tenga que abrir nada.
 *
 * ── LAS DOS PUERTAS, Y POR QUÉ HACEN FALTA LAS DOS ───────────────────────────
 *  · AUTOMÁTICA — cada corrida del agente de handoff la dispara (analyze/route.ts). El documento
 *    cambió, así que el resumen también: dejarlo viejo es peor que no tenerlo.
 *  · MANUAL — un botón en la sección. Sin él, los ~75 handoffs que ya existen se quedaban sin
 *    resumen para siempre, porque regenerarlos solo para eso cuesta una corrida completa del
 *    agente y pisa lo que el CSE haya editado a mano.
 *
 * ── LO QUE ESTE MÓDULO NO HACE ───────────────────────────────────────────────
 * No lee sesiones ni transcripciones: lee **el documento ya escrito** (`loadHandoffContext`).
 * Resumir la fuente en vez del documento daría un texto que contradice al handoff sin que nadie
 * entienda por qué — dos versiones de qué se vendió, y la corta pareciendo la autorizada.
 */
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { loadHandoffContext } from "@/lib/canvas/load-canvas-context";

/**
 * El modelo. El mismo que redacta los resúmenes de proyecto y de cuenta — no porque la tarea sea
 * idéntica, sino porque el costo de que TRES superficies que redactan prosa de negocio usen tres
 * modelos distintos es que nadie puede comparar la calidad entre ellas.
 */
export const RESUMEN_HANDOFF_MODEL = "claude-sonnet-4-6";

/**
 * Tope DURO del texto guardado, en caracteres.
 *
 * No es una preferencia de estilo: este resumen vive en la cabecera de una tarjeta, al lado de
 * otros cuatro datos. Un párrafo de doce líneas no es «un resumen un poco largo» — empuja el
 * documento fuera de la pantalla y reproduce exactamente el problema que vino a resolver. El
 * prompt pide brevedad y esto la garantiza aunque el modelo se pase.
 */
export const MAX_CARACTERES_RESUMEN = 700;

/** Cuánto del documento entra al prompt. Doce secciones entran holgadas; el tope es una red. */
const MAX_CARACTERES_CONTEXTO = 24_000;

const SYSTEM = [
  "Eres el analista de Customer Success de Smarteam, una consultora de HubSpot en Costa Rica.",
  "Escribes para el equipo interno que va a implementar el proyecto, no para el cliente.",
  "Español de Costa Rica, en tuteo (tú/tienes/necesitas). NUNCA voseo (vos/tenés/necesitás).",
].join(" ");

/**
 * La instrucción. Vive separada del armado para poder leerla —y testearla— sin tocar el modelo.
 *
 * Las tres reglas que no son de estilo:
 *  1. **Solo lo que está en el documento.** Un resumen que agrega algo que el handoff no dice se
 *     vuelve una fuente de verdad paralela, y como es la que se lee primero, gana.
 *  2. **El alcance primero.** Si el texto se corta o se lee a medias, lo que tiene que haber
 *     sobrevivido es qué se vendió.
 *  3. **Sin preámbulo.** «Este proyecto consiste en…» gasta una de las frases en no decir nada.
 *
 * Desde el 2026-10-04 (pedido de Elías) también dice, si el documento lo nombra, QUIÉN DECIDE del
 * lado del cliente y QUÉ QUEDÓ FUERA del alcance: son las dos cosas que la persona que ejecuta el
 * proyecto necesita en la primera semana y que el resumen viejo callaba. Son cuatro frases como
 * máximo; el tope de caracteres no cambió.
 */
export const INSTRUCCION_RESUMEN = [
  "Arriba está el documento de handoff de un proyecto.",
  "Escribe un resumen de MÁXIMO 4 frases que responda: ¿qué se le vendió a este cliente y para qué?",
  "",
  "Reglas:",
  "- Usa SOLO lo que dice el documento. Si algo no está, no lo menciones. No inventes alcance, cifras ni fechas.",
  "- Empieza por el alcance contratado (qué se vendió). Después, si cabe, el resultado que el cliente busca.",
  "- Si el documento lo dice, nombra quién decide del lado del cliente (nombre y cargo).",
  "- Si el documento lo dice, cierra con lo que quedó FUERA del alcance, para que nadie lo prometa.",
  "- En tuteo cuando te dirijas al lector. Nunca voseo.",
  "- Nombra productos, integraciones o sistemas concretos si el documento los nombra.",
  "- Sin preámbulo ni títulos. No empieces con «Este proyecto» ni «El handoff».",
  "- Texto plano corrido. Sin viñetas, sin markdown, sin comillas envolventes.",
  `- Máximo ${MAX_CARACTERES_RESUMEN} caracteres en total.`,
].join("\n");

/**
 * Deja el texto del modelo en condiciones de guardarse.
 *
 * PURO, y con test propio: es donde se cumple el tope que el prompt solo pide. El recorte busca el
 * final de la última oración completa que entra — cortar a mitad de palabra y pegar «…» se lee
 * como un error de la aplicación, no como un resumen largo.
 */
export function normalizarResumen(crudo: string): string {
  let t = crudo.trim();
  // El modelo a veces envuelve todo en comillas o lo abre con un título en markdown.
  t = t.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
  t = t.replace(/^#{1,6}\s+.*$/gm, "").trim();
  t = t.replace(/^\s*[-*•]\s+/gm, "");
  t = t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
  t = t.replace(/\s*\n+\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
  if (t.length >= 2 && /^["«“]/.test(t) && /["»”]$/.test(t)) t = t.slice(1, -1).trim();
  if (t.length <= MAX_CARACTERES_RESUMEN) return t;

  const recortado = t.slice(0, MAX_CARACTERES_RESUMEN);
  /* Hasta el último punto que cierra oración. Si no hay ninguno en todo el tramo —un modelo que
     devolvió una sola frase larguísima— se corta por la última palabra entera, que es feo pero
     legible; partir una palabra por la mitad no lo es. */
  const punto = Math.max(recortado.lastIndexOf(". "), recortado.lastIndexOf(".\n"));
  if (punto > MAX_CARACTERES_RESUMEN * 0.4) return recortado.slice(0, punto + 1).trim();
  const espacio = recortado.lastIndexOf(" ");
  return `${(espacio > 0 ? recortado.slice(0, espacio) : recortado).trim()}…`;
}

export type ResultadoDeResumen =
  | { status: "ok"; resumen: string }
  /** El handoff todavía no está escrito: no hay nada que resumir, y no es un error. */
  | { status: "sin_handoff" }
  | { status: "error"; error: string };

/**
 * Escribe el resumen del handoff de un proyecto y lo guarda.
 *
 * ⚠ **No tira nunca.** Los dos llamadores lo necesitan así por motivos distintos y los dos son
 * reales: la corrida del agente no puede fallar entera porque el resumen no salió (el handoff, que
 * es el trabajo, ya está escrito y guardado), y el botón manual prefiere un mensaje a un 500.
 */
export async function generarResumenDeHandoff(projectId: string): Promise<ResultadoDeResumen> {
  let documento: string;
  try {
    documento = await loadHandoffContext(projectId);
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "no se pudo leer el handoff" };
  }
  if (!documento || documento.trim().length < 200) return { status: "sin_handoff" };

  try {
    const msg = await anthropic.messages.create({
      model: RESUMEN_HANDOFF_MODEL,
      max_tokens: 500,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: documento.slice(0, MAX_CARACTERES_CONTEXTO) },
            { type: "text", text: `\n\n${INSTRUCCION_RESUMEN}` },
          ],
        },
      ],
    });
    const crudo = msg.content
      .map((b) => (b.type === "text" ? (b as { text: string }).text : ""))
      .join("")
      .trim();
    const resumen = normalizarResumen(crudo);
    if (!resumen) return { status: "error", error: "el modelo devolvió un resumen vacío" };

    await prisma.project.update({
      where: { id: projectId },
      data: { handoffResumen: resumen, handoffResumenAt: new Date() },
    });
    return { status: "ok", resumen };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "falló la generación" };
  }
}

/**
 * ¿El resumen quedó viejo? El handoff se regeneró DESPUÉS de escribirlo.
 *
 * Puro, y es la razón de que `handoffResumenAt` exista como columna aparte: sin comparar las dos
 * fechas, un resumen de hace tres versiones se muestra con la misma cara que el de hoy. Mismo
 * criterio que `lib/pieces/piece-staleness.ts` usa para las piezas del desplegable.
 */
export function resumenDesactualizado(p: {
  handoffResumenAt: Date | string | null;
  handoffGeneratedAt: Date | string | null;
}): boolean {
  if (!p.handoffResumenAt || !p.handoffGeneratedAt) return false;
  return new Date(p.handoffGeneratedAt).getTime() > new Date(p.handoffResumenAt).getTime();
}
