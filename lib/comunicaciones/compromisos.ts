/**
 * lib/comunicaciones/compromisos.ts — el pedido a la IA para leer los COMPROMISOS de un correo enviado, y la lectura de
 * su respuesta. PURO (iniciativa B; plan en docs/correos-en-el-contexto-plan.md).
 *
 * Lo que Smarteam le promete al cliente por correo (una reunión, una entrega, una fecha) y lo que el correo recapitula
 * que prometió el cliente (una minuta enviada) son compromisos, igual que los de una reunión. Por eso usan el MISMO
 * esquema (`esquemaDeLosCompromisos`, lib/sessions/lectura-salida.ts) y la MISMA salida (lib/tareas/seguimiento.ts): no
 * hay otro lector de compromisos. La cita se verifica tal cual contra el texto del correo; la que no está, no entra.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { esquemaDeLosCompromisos } from "@/lib/sessions/lectura-salida";
import { leerCompromisos, type CompromisoDetectado } from "@/lib/sessions/compromisos-y-alcance";
import { citaEstaEnLasFuentes, normalizarParaCita } from "@/lib/timeline/limites";

export const MODELO_DE_COMPROMISOS = "claude-haiku-4-5";
export const HERRAMIENTA_DE_COMPROMISOS = "registrar_compromisos_del_correo";
export const SEGUNDOS_DE_COMPROMISOS = 30;
export const MAX_TOKENS_DE_COMPROMISOS = 1_500;
/** El slug de la corrida y del medidor: la familia «Tareas» en Uso de Nexus (lib/uso/ia.ts). */
export const SLUG_DE_COMPROMISOS = "tareas-correo";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const SYSTEM = `Eres el lector de correos de Nexus, el sistema interno de Smarteam (una agencia de HubSpot). Lees UN correo que alguien de Smarteam le mandó a un cliente y registras sus COMPROMISOS: lo que Smarteam prometió (una reunión, una entrega, un envío, una fecha) y lo que el correo dice que prometió el cliente (por ejemplo, en una minuta enviada).

Reglas:
- Solo compromisos EXPLÍCITOS: alguien dice QUÉ se va a hacer y QUIÉN lo hace. Una cortesía («quedo atento», «cualquier duda me avisas») no es un compromiso.
- Una reunión prometida o propuesta («nos reunimos el martes», «agendamos la sesión de revisión para el 20») es un compromiso de Smarteam de tipo PLAN, con su fecha.
- La fecha va en AAAA-MM-DD, calculada con el calendario desde la fecha del correo. Si no se dijo, null.
- La cita es una frase copiada TEXTUAL del correo, de 12 caracteres o más, sin cambiarle una palabra ni agregar puntos suspensivos.
- En «que» y «tituloDeSeguimiento», español neutro con tuteo. Nunca voseo.
- No inventes: si el correo no trae compromisos, la lista vacía es correcta.
- Llama UNA vez a la herramienta ${HERRAMIENTA_DE_COMPROMISOS}.`;

export interface CorreoParaLeer {
  /** El nombre de la empresa del cliente. */
  empresa: string;
  /** Quién lo mandó (nombre o correo), si se sabe. */
  autor: string | null;
  ocurrioAt: Date;
  asunto: string | null;
  texto: string;
}

/** «jueves 16 de octubre de 2026», en hora de Costa Rica (UTC-6, sin horario de verano). */
export function fechaDelCorreo(d: Date): { iso: string; legible: string } {
  const cr = new Date(+d - 6 * 3_600_000);
  const iso = cr.toISOString().slice(0, 10);
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return { iso, legible: `${DIAS[cr.getUTCDay()]} ${cr.getUTCDate()} de ${meses[cr.getUTCMonth()]} de ${cr.getUTCFullYear()}` };
}

export function pedidoDeCompromisos(c: CorreoParaLeer, emailsDelEquipo: readonly string[]): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const f = fechaDelCorreo(c.ocurrioAt);
  const herramienta: Anthropic.Messages.Tool = {
    name: HERRAMIENTA_DE_COMPROMISOS,
    description: "Registra los compromisos del correo, de los dos lados, con su cita textual.",
    input_schema: {
      type: "object",
      properties: { compromisos: esquemaDeLosCompromisos(emailsDelEquipo, "correo") },
      required: ["compromisos"],
    } as Anthropic.Messages.Tool.InputSchema,
  };
  const contenido = [
    `Empresa del cliente: ${c.empresa}`,
    `Fecha del correo: ${f.legible} (${f.iso})`,
    c.autor ? `Lo mandó: ${c.autor} (de Smarteam)` : null,
    c.asunto ? `Asunto: ${c.asunto}` : null,
    "",
    "TEXTO DEL CORREO",
    c.texto,
  ]
    .filter((x) => x !== null)
    .join("\n");
  return {
    model: MODELO_DE_COMPROMISOS,
    max_tokens: MAX_TOKENS_DE_COMPROMISOS,
    temperature: 0,
    system: SYSTEM,
    tools: [herramienta],
    tool_choice: { type: "tool", name: HERRAMIENTA_DE_COMPROMISOS },
    messages: [{ role: "user", content: contenido }],
  };
}

export interface CompromisosDelCorreo {
  compromisos: CompromisoDetectado[];
  /** Los que traían una cita que no está tal cual en el correo: se descartan. */
  descartadosPorCita: number;
}

/**
 * Los compromisos de la respuesta, con la cita verificada contra el asunto y el texto del correo. null si la respuesta
 * no sirve (cortada o sin la herramienta): el correo se reintenta.
 */
export function leerCompromisosDelCorreo(
  respuesta: Pick<Anthropic.Messages.Message, "content" | "stop_reason">,
  correo: Pick<CorreoParaLeer, "asunto" | "texto">,
): CompromisosDelCorreo | null {
  if (respuesta.stop_reason === "max_tokens") return null;
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_DE_COMPROMISOS);
  if (!bloque || bloque.type !== "tool_use") return null;
  const todos = leerCompromisos((bloque.input as { compromisos?: unknown } | null)?.compromisos);
  const fuente = normalizarParaCita(`${correo.asunto ?? ""}\n${correo.texto}`);
  const compromisos = todos.filter((c) => citaEstaEnLasFuentes(c.cita, fuente));
  return { compromisos, descartadosPorCita: todos.length - compromisos.length };
}
