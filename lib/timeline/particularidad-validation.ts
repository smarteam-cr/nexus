/**
 * lib/timeline/particularidad-validation.ts
 *
 * Reglas de contenido de una Particularidad, en UN solo lugar. Antes el invariante vivía repetido
 * en el parseo del agente, el apply y el PATCH; al sumar la creación MANUAL (POST) hubiera sido la
 * cuarta copia. Acá viven las reglas compartidas por los caminos HUMANOS (POST + PATCH).
 *
 * Eje DESTINO (docs/DECISIONS.md):
 *  - `ATRASO` es un corrimiento CUANTIFICADO → exige `weeksImpact ≥ 1` (si no, el resumen con
 *    atribución miente: suma cero y el cliente lee un atraso sin impacto).
 *  - `SOLICITUD` está deprecado: un insumo del cliente es una TAREA `party=CLIENTE`, no una
 *    particularidad. No se puede fijar; solo sobrevive como passthrough en filas legacy.
 *  - `AVISO` es la nota libre del CSE al cliente que NO mueve fechas → `weeksImpact` SIEMPRE null,
 *    así no contamina el corrimiento ni la atribución. El agente NUNCA lo emite (es solo humano).
 */
import type { ParticularidadKind, TaskParty } from "@prisma/client";

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Kinds que puede fijar un HUMANO (incluye la nota libre). */
export const HUMAN_KINDS = new Set<string>(["ATRASO", "COMPROMISO", "AVISO"]);
/** Kinds que puede proponer el AGENTE — angosto a propósito: solo desviaciones fechadas. */
export const AGENT_KINDS = new Set<string>(["ATRASO", "COMPROMISO"]);

export const VALID_PARTIES = new Set<string>(["CLIENTE", "SMARTEAM", "AMBOS", "DEV"]);

export function parseTitle(v: unknown): FieldResult<string> {
  const title = typeof v === "string" ? v.trim() : "";
  if (!title) return { ok: false, error: "El título no puede quedar vacío" };
  return { ok: true, value: title };
}

/** detail/sourceQuote: texto opcional; vacío → null (limpia el campo). */
export function parseOptionalText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function parseParty(v: unknown): FieldResult<TaskParty> {
  const party = typeof v === "string" ? v.toUpperCase() : "";
  if (!VALID_PARTIES.has(party)) {
    return { ok: false, error: `party debe ser uno de ${[...VALID_PARTIES].join("|")}` };
  }
  return { ok: true, value: party as TaskParty };
}

/**
 * Kind fijable por un humano. `allowExisting` permite el passthrough de una fila legacy
 * (p.ej. editar una SOLICITUD vieja sin poder volver a fijar SOLICITUD en otras).
 */
export function parseKind(v: unknown, allowExisting?: ParticularidadKind): FieldResult<ParticularidadKind> {
  const kind = typeof v === "string" ? v.toUpperCase() : "";
  if (!HUMAN_KINDS.has(kind) && kind !== allowExisting) {
    return { ok: false, error: `kind debe ser uno de ${[...HUMAN_KINDS].join("|")}` };
  }
  return { ok: true, value: kind as ParticularidadKind };
}

export function parseWeeksImpact(v: unknown): FieldResult<number | null> {
  if (v === null) return { ok: true, value: null };
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return { ok: true, value: Math.round(v) };
  return { ok: false, error: "weeksImpact debe ser un entero ≥0 o null" };
}

export function parseOccurredAt(v: unknown): FieldResult<Date> {
  if (v === null) return { ok: false, error: "occurredAt no puede ser null" };
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  if (Number.isNaN(t)) return { ok: false, error: "occurredAt debe ser una fecha válida (ISO)" };
  return { ok: true, value: new Date(t) };
}

/** Un AVISO nunca lleva semanas (no mueve el plan); el resto pasa tal cual. */
export function normalizeWeeksForKind(kind: ParticularidadKind, weeks: number | null): number | null {
  return kind === "AVISO" ? null : weeks;
}

/** Invariante cross-field. Devuelve el mensaje de error, o null si está bien. */
export function checkKindWeeksInvariant(kind: ParticularidadKind, weeks: number | null): string | null {
  if (kind === "ATRASO" && (weeks === null || weeks < 1)) {
    return "Un atraso necesita al menos 1 semana.";
  }
  return null;
}
