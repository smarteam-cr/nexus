/**
 * lib/tareas/ia/conversacion.ts — el nivel 2 de la lectura: leer la CONVERSACIÓN entera (docs/tareas-plan.md §7.3).
 * PURO.
 *
 * Cuando las notas no traen «Próximos pasos» (o la persona pide «¿Faltó algo?»), Haiku lee la transcripción
 * comprimida y numerada por turno y devuelve, con la herramienta forzada `extraer_tareas`, hasta 15 compromisos:
 * un título corto, su dueño (M#, solo alguien del equipo que estuvo), el turno que lo dice, y de listas cerradas la
 * tarea que ya existe (T#), el proyecto (R#), el grupo (G#) y cuándo vence. La cita es el número del turno: el texto
 * literal lo pone el código. Escribe libre el título (se recorta a 60 y, si trae voseo, se marca para revisar, sin
 * reintento) y el CONTEXTO de cada tarea (2026-10-09: para qué es, para quién y qué se espera; si no sirve, lo arma el
 * código con el turno). Todo queda como PROPUESTA: decide una persona.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import { CLAVES_DE_VENCIMIENTO, type ClaveDeVencimiento } from "../fechas";
import { huellaDeTexto } from "../texto";
import { limpiarContexto } from "../contexto-de-tarea";
import { nombreDeGrupoValido } from "./salida";

export const MODELO_DE_LA_CONVERSACION = "claude-haiku-4-5";
export const HERRAMIENTA_DE_LA_CONVERSACION = "extraer_tareas";
/** Con el contexto de cada tarea (unas 100 palabras más por tarea). */
export const MAX_TOKENS_DE_LA_CONVERSACION = 4_500;
export const SEGUNDOS_DE_LA_CONVERSACION = 60;
/** Como mucho, cuántas tareas saca de una conversación. */
export const TAREAS_DE_UNA_CONVERSACION = 15;
export const LARGO_DE_UN_TITULO = 60;

export interface PedidoDeConversacion {
  titulo: string;
  fecha: string;
  /** «[12] Ana Pérez: …», un turno por línea. */
  conversacion: string;
  turnos: number;
  recortada: boolean;
  /** Solo las personas del equipo que estuvieron: nadie de afuera de la sala es dueño. */
  personas: { ref: string; nombre: string; equipo: string }[];
  candidatas: { ref: string; titulo: string; dueno: string | null; estado: string }[];
  proyectos: { ref: string; nombre: string; estado: string }[];
  /** Lo que ya salió de las notas de esta reunión: no se repite. */
  yaSalieron: string[];
}

const SYSTEM = `Eres el asistente de tareas internas de Smarteam. Lees la conversación de una reunión del equipo y sacas los COMPROMISOS: algo concreto que alguien del equipo quedó en hacer. Una persona revisa todo lo que propones: nada entra solo.

Reglas:
- Solo compromisos concretos («yo te mando el Excel el jueves», «queda Lidia con el banner»). Un tema que se conversó, una idea o una opinión no es una tarea.
- Lo que se comprometió a hacer alguien de afuera del equipo (el cliente, un proveedor) no es una tarea del equipo: no lo pongas.
- «titulo»: como mucho 60 caracteres, en español, empieza con un verbo en infinitivo («Enviar el Excel de leads a Fabio»). Nunca en voseo.
- «contexto»: de una a tres frases que dicen para qué es, para quién (el cliente o el equipo) y qué se espera, con lo que se dijo en la conversación. Es lo que lee quien la recibe para entenderla. Sin repetir el título, sin fechas ni montos que nadie dijo, en español neutro (nunca voseo).
- «dueno»: la persona del equipo (M#) que se comprometió. Si quien habla dice «yo lo hago», es quien habla. Si no está claro, null. Usa solo las M# que te dan.
- «turno»: el número del turno donde se dice el compromiso (el que está entre corchetes).
- «misma»: la tarea que ya existe (T#) que es ESA MISMA tarea dicha con otras palabras; si dudas, null.
- «proyecto»: un proyecto existente (R#) al que claramente pertenece; si no, null.
- «grupo»: si 3 o más tareas forman algo nuevo y concreto (una campaña, un evento), dales el mismo G# y nombra el grupo en «grupos» (máximo 40 caracteres, sin la palabra «proyecto»). Si no hay un grupo claro, no inventes uno.
- «vence»: solo si la conversación dice cuándo; si no, null.
- No repitas lo que ya salió de las notas (la lista «YA SALIERON»).
- Como mucho 15 tareas: las más claras primero. Si no hay compromisos, devuelve la lista vacía.
- Usa SOLO los ids que te dan. Nunca inventes uno.`;

const enumONulo = (valores: string[]) => (valores.length ? { type: ["string", "null"], enum: [...valores, null] } : { type: "null" });

export function pedidoDeConversacion(p: PedidoDeConversacion): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const refsM = p.personas.map((m) => m.ref);
  const refsT = p.candidatas.map((t) => t.ref);
  const refsR = p.proyectos.map((r) => r.ref);

  const partes: string[] = [];
  partes.push(`Reunión: «${p.titulo}» · ${p.fecha}`);
  partes.push(`\nPERSONAS DEL EQUIPO QUE ESTUVIERON\n${p.personas.map((m) => `${m.ref} ${m.nombre} (${m.equipo})`).join("\n") || "(ninguna)"}`);
  if (p.candidatas.length) partes.push(`\nTAREAS QUE YA EXISTEN\n${p.candidatas.map((t) => `${t.ref} «${t.titulo}»${t.dueno ? ` · ${t.dueno}` : ""} · ${t.estado}`).join("\n")}`);
  if (p.proyectos.length) partes.push(`\nPROYECTOS\n${p.proyectos.map((r) => `${r.ref} «${r.nombre}» (${r.estado})`).join("\n")}`);
  if (p.yaSalieron.length) partes.push(`\nYA SALIERON DE LAS NOTAS (no las repitas)\n${p.yaSalieron.map((t) => `- ${t}`).join("\n")}`);
  partes.push(`\nCONVERSACIÓN${p.recortada ? " (no entró entera: faltan los últimos turnos)" : ""}\n${p.conversacion}`);

  const herramienta: Anthropic.Messages.Tool = {
    name: HERRAMIENTA_DE_LA_CONVERSACION,
    description: "Devuelve los compromisos del equipo que salieron de la conversación, cada uno con su dueño y el turno que lo dice, y los grupos nuevos.",
    input_schema: {
      type: "object",
      properties: {
        tareas: {
          type: "array",
          maxItems: TAREAS_DE_UNA_CONVERSACION,
          items: {
            type: "object",
            properties: {
              titulo: { type: "string" },
              contexto: { type: "string" },
              dueno: enumONulo(refsM),
              turno: { type: "integer", minimum: 1, maximum: Math.max(1, p.turnos) },
              misma: enumONulo(refsT),
              proyecto: enumONulo(refsR),
              grupo: { type: ["string", "null"] },
              vence: enumONulo([...CLAVES_DE_VENCIMIENTO]),
            },
            required: ["titulo", "contexto", "turno"],
          },
        },
        grupos: {
          type: "array",
          items: {
            type: "object",
            properties: { G: { type: "string" }, nombre: { type: "string" }, mismoQue: enumONulo(refsR) },
            required: ["G", "nombre"],
          },
        },
      },
      required: ["tareas"],
    } as Anthropic.Messages.Tool.InputSchema,
  };

  return {
    model: MODELO_DE_LA_CONVERSACION,
    max_tokens: MAX_TOKENS_DE_LA_CONVERSACION,
    temperature: 0,
    system: SYSTEM,
    tools: [herramienta],
    tool_choice: { type: "tool", name: HERRAMIENTA_DE_LA_CONVERSACION },
    messages: [{ role: "user", content: partes.join("\n") }],
  };
}

/* ── Lo que devolvió ─────────────────────────────────────────────────────────────── */

export interface TareaDeLaConversacion {
  titulo: string;
  /** El título se recortó o trae voseo: la persona lo revisa antes de usarlo. */
  revisarTitulo: boolean;
  /** Para qué es, para quién y qué se espera. Null si el del modelo no sirve (lo arma el código con el turno). */
  contexto: string | null;
  dueno: string | null;
  turno: number;
  misma: string | null;
  proyecto: string | null;
  grupo: string | null;
  vence: ClaveDeVencimiento | null;
}

export interface SalidaDeLaConversacion {
  tareas: TareaDeLaConversacion[];
  grupos: { G: string; nombre: string; mismoQue: string | null }[];
}

export interface RefsDeLaConversacion {
  M: ReadonlySet<string>;
  T: ReadonlySet<string>;
  R: ReadonlySet<string>;
  turnos: number;
  /** Las huellas de lo que ya salió de las notas: lo repetido se descarta. */
  yaSalieron: ReadonlySet<string>;
}

const deLaLista = (v: unknown, lista: ReadonlySet<string>): string | null => (typeof v === "string" && lista.has(v) ? v : null);

/** Palabras que terminan en vocal con tilde y NO son un imperativo de voseo. */
const NO_ES_IMPERATIVO = new Set(["está", "esté", "allá", "acá", "aquí", "allí", "ahí", "menú", "jamás", "además", "quizá", "después", "detrás", "atrás"]);

/** ¿Trae voseo el título? «Mandá el reporte», «Revisá…», o lo que caza la regla de la prosa. */
export function tituloConVoseo(titulo: string): boolean {
  if (voseoEnProsa(titulo).length) return true;
  const primera = (titulo.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-záéíóúñü]/g, "");
  return primera.length >= 4 && /[áéí]$/.test(primera) && !NO_ES_IMPERATIVO.has(primera);
}

/** Recorta a 60 por palabra, sin dejar la frase colgando de un signo. */
function recortarTitulo(t: string): string {
  if (t.length <= LARGO_DE_UN_TITULO) return t;
  const corte = t.slice(0, LARGO_DE_UN_TITULO + 1).replace(/\s+\S*$/, "");
  return (corte || t.slice(0, LARGO_DE_UN_TITULO)).replace(/[\s,;:.–-]+$/, "");
}

/** Lee y valida. `null` = no se usa nada del modelo (sin herramienta, o cortada). */
export function leerSalidaDeConversacion(respuesta: Pick<Anthropic.Messages.Message, "content" | "stop_reason">, refs: RefsDeLaConversacion): SalidaDeLaConversacion | null {
  if (respuesta.stop_reason === "max_tokens") return null;
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_DE_LA_CONVERSACION);
  if (!bloque || bloque.type !== "tool_use") return null;
  const input = (bloque.input ?? {}) as { tareas?: unknown; grupos?: unknown };

  const tareas: TareaDeLaConversacion[] = [];
  const vistas = new Set<string>();
  for (const crudo of Array.isArray(input.tareas) ? input.tareas : []) {
    if (tareas.length >= TAREAS_DE_UNA_CONVERSACION) break;
    if (!crudo || typeof crudo !== "object") continue;
    const x = crudo as Record<string, unknown>;
    const original = typeof x.titulo === "string" ? x.titulo.replace(/\s+/g, " ").trim().replace(/^[-•*]\s*/, "") : "";
    const turno = typeof x.turno === "number" && Number.isInteger(x.turno) && x.turno >= 1 && x.turno <= refs.turnos ? x.turno : null;
    if (!original || turno === null) continue;
    const titulo = recortarTitulo(original);
    const huella = huellaDeTexto(titulo);
    if (!huella || vistas.has(huella) || refs.yaSalieron.has(huella)) continue;
    vistas.add(huella);
    const vence = typeof x.vence === "string" && (CLAVES_DE_VENCIMIENTO as readonly string[]).includes(x.vence) ? (x.vence as ClaveDeVencimiento) : null;
    const contexto = limpiarContexto(x.contexto, titulo);
    tareas.push({
      titulo,
      revisarTitulo: titulo !== original || tituloConVoseo(titulo),
      contexto: "contexto" in contexto ? contexto.contexto : null,
      dueno: deLaLista(x.dueno, refs.M),
      turno,
      misma: deLaLista(x.misma, refs.T),
      proyecto: deLaLista(x.proyecto, refs.R),
      grupo: typeof x.grupo === "string" && /^G\d{1,2}$/.test(x.grupo) ? x.grupo : null,
      vence,
    });
  }

  const grupos: SalidaDeLaConversacion["grupos"] = [];
  const declarados = new Set<string>();
  for (const crudo of Array.isArray(input.grupos) ? input.grupos : []) {
    if (!crudo || typeof crudo !== "object") continue;
    const x = crudo as Record<string, unknown>;
    if (typeof x.G !== "string" || !/^G\d{1,2}$/.test(x.G) || declarados.has(x.G)) continue;
    const suyas = tareas.filter((t) => t.grupo === x.G);
    if (!suyas.length) continue;
    declarados.add(x.G);
    const textos = suyas.map((t) => t.titulo);
    const nombre = typeof x.nombre === "string" && nombreDeGrupoValido(x.nombre, textos) ? x.nombre.trim() : textos[0].slice(0, 40);
    grupos.push({ G: x.G, nombre, mismoQue: deLaLista(x.mismoQue, refs.R) });
  }
  for (const t of tareas) if (t.grupo && !declarados.has(t.grupo)) t.grupo = null;

  return { tareas, grupos };
}
