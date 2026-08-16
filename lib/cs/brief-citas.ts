/**
 * lib/cs/brief-citas.ts — LA GARANTÍA DE QUE UN RESUMEN NO INVENTA.
 *
 * ── QUÉ HACE ─────────────────────────────────────────────────────────────────
 * Un brief es un puñado de afirmaciones sobre un cliente —o, con el brief por proyecto, sobre un
 * proyecto— que una persona va a leer y repetir en una llamada. Cada afirmación tiene que venir
 * con la FUENTE de donde salió, y la fuente tiene que existir de verdad en el contexto que se le
 * pasó al modelo.
 *
 * Este módulo es el único lugar donde eso se hace cumplir: una afirmación cuya cita no está en el
 * mapa de fuentes **se descarta**, no se muestra con una advertencia ni se deja pasar «porque el
 * texto se ve razonable». Sin fuente no hay afirmación.
 *
 * ── POR QUÉ VIVE APARTE (2026-08-16) ─────────────────────────────────────────
 * Era una función privada de `account-brief.ts`, un archivo que importa Prisma y el SDK de
 * Anthropic — o sea, imposible de probar sin base ni red, y de hecho **no tenía ni un test**.
 * La función que decide si algo inventado llega a un humano no puede ser la que no se prueba.
 *
 * Y además hace falta compartirla: el brief por PROYECTO clona estas mismas garantías, y dos
 * copias de la regla «descartá lo que no tenga fuente» es exactamente la clase de duplicación que
 * diverge callada — una se relaja para «tolerar» un caso raro y nadie se entera de que el otro
 * documento sigue estricto (o al revés).
 *
 * ── LO QUE **NO** HACE, A PROPÓSITO ──────────────────────────────────────────
 * No arregla, no completa y no re-pregunta. Un JSON malformado LANZA (la corrida queda en ERROR
 * con su causa, auditable); una cita inválida DESCARTA esa afirmación y sigue. Son dos respuestas
 * distintas porque son dos problemas distintos: lo primero es que el modelo falló, lo segundo es
 * que el modelo alucinó UNA cosa y el resto puede servir.
 */

/** Una fuente citable: de dónde salió una afirmación. */
export interface BriefSource {
  kind: string;
  id: string;
  label: string;
  date: string | null;
}

/** Una afirmación ya validada: su fuente EXISTE en el contexto que vio el modelo. */
export interface BriefStatement {
  text: string;
  source: { kind: string; id: string; label: string; date: string | null };
}

export interface BriefParseado {
  headline: string | null;
  statements: BriefStatement[];
  /** Cuántas afirmaciones se tiraron. Se muestra: un descarte alto es señal de prompt flojo. */
  discarded: number;
}

/**
 * El primer objeto JSON balanceado del texto.
 *
 * Los modelos suelen envolver el JSON en prosa o en un bloque de código; recortar por la primera
 * `{` y la última `}` rompería ante cualquier llave dentro de un string (y los textos en español
 * las traen). Por eso se recorre contando profundidad y respetando comillas y escapes.
 */
export function extraerJson(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/** Tope duro de afirmaciones. El prompt pide 12; el excedente CUENTA como descartado. */
export const TOPE_STATEMENTS = 15;

/**
 * Parsea la salida del agente y se queda SOLO con lo que tiene fuente real.
 *
 * LANZA en malformado (no hay JSON, JSON inválido, sin array `statements`, o cero afirmaciones
 * válidas). DESCARTA la afirmación cuya cita no está en `sources`.
 */
export function parsearBriefCitado(
  rawText: string,
  sources: Map<string, BriefSource>,
): BriefParseado {
  const jsonText = extraerJson(rawText);
  if (!jsonText) throw new Error("output del agente sin JSON");
  let parsed: { headline?: unknown; statements?: unknown };
  try {
    parsed = JSON.parse(jsonText) as { headline?: unknown; statements?: unknown };
  } catch {
    throw new Error("output del agente con JSON inválido");
  }
  if (!Array.isArray(parsed.statements)) throw new Error("output del agente sin array `statements`");

  const statements: BriefStatement[] = [];
  let discarded = Math.max(0, parsed.statements.length - TOPE_STATEMENTS);
  for (const raw of parsed.statements.slice(0, TOPE_STATEMENTS)) {
    const s = raw as Record<string, unknown>;
    const text = typeof s.text === "string" ? s.text.trim() : "";
    const key = typeof s.source === "string" ? s.source.trim().replace(/^\[|\]$/g, "") : "";
    const src = sources.get(key);
    if (!text || !src) {
      discarded++;
      continue;
    }
    statements.push({
      text,
      source: { kind: src.kind, id: src.id, label: src.label, date: src.date },
    });
  }
  if (statements.length === 0) {
    throw new Error("el agente no produjo ningún statement con fuente válida");
  }
  return {
    headline:
      typeof parsed.headline === "string" && parsed.headline.trim()
        ? parsed.headline.trim().slice(0, 400)
        : null,
    statements,
    discarded,
  };
}
