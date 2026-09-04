/**
 * lib/business-cases/diagnostico-de-generacion.ts — por qué falló una generación (B-10).
 *
 * Una de cada cuatro propuestas de los últimos 30 días terminó en ERROR (auditoría 2026-09-03), y
 * el `output` del run solo decía «reintentá». Dos causas que se tratan distinto y se veían igual:
 *   · el modelo se CORTÓ por `max_tokens` → hay que reducir el contexto o subir el tope;
 *   · el modelo terminó pero el JSON no parsea → es un problema de prompt, no de tamaño.
 * Lo que las distingue es `stop_reason` y el largo del texto, y eso es lo que ahora viaja en el
 * mensaje —y por lo tanto en `AgentRun.output`, que el route escribe con `err.message`.
 *
 * Puro: no llama al modelo, no toca la base. `canvas-agent.ts` lo consume.
 */
import { parseObject } from "@/lib/ai/section-schema";

/** Lo que este módulo necesita de la respuesta del SDK — el tipo real del SDK lo cumple. */
export type RespuestaDelModelo = {
  stop_reason: string | null;
  content: ReadonlyArray<{ type: string; text?: string }>;
};

export type MotivoDeFallo = "max_tokens" | "json_invalido";

export type DiagnosticoDeGeneracion = {
  motivo: MotivoDeFallo;
  stopReason: string | null;
  textoLength: number;
  /** Lo que lee la persona en la UI y lo que queda en `AgentRun.output`. */
  mensaje: string;
};

export type ResultadoDeDiagnostico =
  | { ok: true; texto: string; obj: Record<string, unknown> }
  | { ok: false; diagnostico: DiagnosticoDeGeneracion };

export class GeneracionFallidaError extends Error {
  readonly diagnostico: DiagnosticoDeGeneracion;
  constructor(diagnostico: DiagnosticoDeGeneracion) {
    super(diagnostico.mensaje);
    this.name = "GeneracionFallida";
    this.diagnostico = diagnostico;
  }
}

/** El texto de la respuesta: los bloques `text` concatenados. */
export function textoDe(msg: RespuestaDelModelo): string {
  return msg.content.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("");
}

const MENSAJE_HUMANO: Record<MotivoDeFallo, string> = {
  max_tokens: "la generación se cortó por límite de tokens — reintentá (si persiste, reducí las fuentes de contexto)",
  json_invalido: "el agente no devolvió un JSON válido — reintentá la generación",
};

function diagnostico(motivo: MotivoDeFallo, stopReason: string | null, textoLength: number): DiagnosticoDeGeneracion {
  return {
    motivo,
    stopReason,
    textoLength,
    mensaje: `${MENSAJE_HUMANO[motivo]} [stop_reason=${stopReason ?? "null"} · texto=${textoLength} chars]`,
  };
}

/**
 * Decide si la respuesta sirve. El corte por tokens se mira ANTES de parsear: un JSON cortado a
 * la mitad también «no parsea», y reportarlo como JSON inválido mandaría a arreglar el prompt
 * cuando el problema es el tamaño. `parse` es inyectable para el test.
 */
export function diagnosticarRespuesta(
  msg: RespuestaDelModelo,
  parse: (texto: string) => Record<string, unknown> = parseObject,
): ResultadoDeDiagnostico {
  const texto = textoDe(msg);
  if (msg.stop_reason === "max_tokens") {
    return { ok: false, diagnostico: diagnostico("max_tokens", msg.stop_reason, texto.length) };
  }
  const obj = parse(texto);
  if (Object.keys(obj).length === 0) {
    return { ok: false, diagnostico: diagnostico("json_invalido", msg.stop_reason, texto.length) };
  }
  return { ok: true, texto, obj };
}
