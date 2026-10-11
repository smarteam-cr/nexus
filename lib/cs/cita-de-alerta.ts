/**
 * lib/cs/cita-de-alerta.ts — la frase del cliente que respalda una queja o un retraso (2026-10-09). PURO.
 *
 * Entrega 2 de docs/exito-del-cliente-cartera-plan.md: una alerta del agente vigía pinta el color de la cuenta
 * SOLO si es una queja del cliente o un retraso, y SOLO con la frase literal verificada contra la reunión o el
 * correo de donde salió (como en la preventa). El agente escribe `evidence.cita = { texto, sessionId | correoId }`;
 * el runner (lib/cs/watchdog.ts) busca la frase en esa fuente y guarda el resultado con `verificada: true`. Una
 * frase que no aparece queda como `citaSinVerificar` y la alerta se ve igual, pero no pinta.
 */
import { comprimirConversacion } from "@/lib/sessions/conversacion";
import { citaEstaEnLasFuentes, normalizarParaCita } from "@/lib/timeline/limites";

/** Las dos clases de alerta que pintan, con la frase verificada. Las demás del vigía se ven aparte y no pintan. */
export const CATEGORIAS_QUE_PINTAN: ReadonlySet<string> = new Set(["QUEJA", "TIMELINE_OVERDUE"]);

export type FuenteDeCita = "reunion" | "minuta" | "correo";

export interface CitaDeAlerta {
  /** La frase, tal cual. */
  texto: string;
  fuente: FuenteDeCita;
  /** El id de la reunión (FirefliesSession) o del correo (engagement de HubSpot). */
  id: string;
  /** AAAA-MM-DD. */
  fecha: string | null;
  titulo: string | null;
}

/** Lo que pide el agente en `evidence.cita`. */
export interface CitaPedida {
  texto: string;
  sessionId: string | null;
  correoId: string | null;
}

/** La cita que escribió el agente, si trae texto y de dónde. */
export function citaPedida(evidence: unknown): CitaPedida | null {
  const c = (evidence as { cita?: unknown } | null)?.cita;
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const o = c as Record<string, unknown>;
  const texto = typeof o.texto === "string" ? o.texto.trim() : "";
  const sessionId = typeof o.sessionId === "string" && o.sessionId.trim() ? o.sessionId.trim() : null;
  const correoId = typeof o.correoId === "string" && o.correoId.trim() ? o.correoId.trim() : null;
  if (!texto || (!sessionId && !correoId)) return null;
  return { texto: texto.slice(0, 400), sessionId, correoId };
}

/** ¿La frase está tal cual en el texto? (sin mayúsculas, tildes, comillas ni espacios de más; 12 caracteres o más). */
export function citaEnElTexto(cita: string, texto: string | null | undefined): boolean {
  return !!texto && citaEstaEnLasFuentes(cita, normalizarParaCita(texto));
}

/**
 * Quién dijo la frase en la transcripción: el nombre del primer turno donde aparece tal cual. null si no aparece en un
 * turno (pega dos turnos, o la transcripción no tiene la forma «Nombre: lo dicho»).
 */
export function hablanteDeLaCita(cita: string, transcript: string | null | undefined): string | null {
  if (!transcript) return null;
  const turnos = comprimirConversacion(transcript, Number.MAX_SAFE_INTEGER).turnos.filter((t) => citaEnElTexto(cita, t.texto));
  return turnos.length ? turnos[0].hablante : null;
}

/** La cita verificada que guardó el runner, o null. Lo que lee la cartera. */
export function citaDeLaEvidencia(evidence: unknown): CitaDeAlerta | null {
  const c = (evidence as { cita?: unknown } | null)?.cita;
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const o = c as Record<string, unknown>;
  if (o.verificada !== true || typeof o.texto !== "string" || typeof o.id !== "string") return null;
  const fuente = o.fuente === "correo" || o.fuente === "minuta" ? o.fuente : "reunion";
  return {
    texto: o.texto,
    fuente,
    id: o.id,
    fecha: typeof o.fecha === "string" ? o.fecha : null,
    titulo: typeof o.titulo === "string" ? o.titulo : null,
  };
}

/** «en la reunión «Seguimiento» del 3 oct» · «en un correo del 3 oct». */
export function dondeLoDijo(c: CitaDeAlerta, fmt: (dia: string) => string): string {
  const cuando = c.fecha ? ` del ${fmt(c.fecha)}` : "";
  if (c.fuente === "correo") return `en un correo${cuando}`;
  const titulo = c.titulo ? ` «${c.titulo}»` : "";
  return c.fuente === "minuta" ? `en la minuta de la reunión${titulo}${cuando}` : `en la reunión${titulo}${cuando}`;
}
