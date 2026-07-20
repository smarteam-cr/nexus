/**
 * lib/canvas/regenerate-section.ts — núcleo COMPARTIDO de la edición por IA de
 * una sección tipada (píldora ✨IA de SectionTools). Unifica lo que las dos
 * rutas gemelas de `blocks/regenerate` (projects/Kickoff y business-cases)
 * duplicaban: el parse del body {blockId, instruction, base?}, el gate de
 * sección curada (`agentGenerated:false` → 400) y la llamada a
 * `regenerateSectionDataForDef` con su catch. Las rutas quedan como wrappers
 * de guard/pertenencia — el CONTRATO con el front (`useCanvasSections.
 * regenerateBlock`) no cambia: mismos paths, bodies y respuestas.
 */
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";
import { regenerateSectionDataForDef } from "@/lib/business-cases/canvas-agent";

export interface RegenBody {
  blockId: string;
  instruction: string;
  /** Multi-turno: draft en progreso del que parte la regen (encadena "más corto"
   *  → "más formal"). Input no confiable, pero SOLO alimenta el prompt — el
   *  guardado es un PUT aparte. */
  base: { content?: string | null; data?: unknown } | null;
}

/** Body de las rutas de regenerate. `null` = inválido → 400 del wrapper. */
export function parseRegenBody(raw: unknown): RegenBody | null {
  const body = (raw ?? {}) as { blockId?: unknown; instruction?: unknown; base?: unknown };
  const blockId = typeof body.blockId === "string" ? body.blockId : "";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!blockId || !instruction) return null;
  const base = body.base && typeof body.base === "object" ? (body.base as RegenBody["base"]) : null;
  return { blockId, instruction, base };
}

export type RegenTypedResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; status: number };

/**
 * Regenera el `data` de una sección TIPADA (bloque CARD) según la instrucción.
 * - `def` ausente → `{}` (mismo fallback histórico de `regenerateSectionData`:
 *   una key que ya no está en ningún template no revienta, devuelve data vacía).
 * - Sección curada (`agentGenerated:false`) → 400 con `curatedMessage` (cada
 *   documento tiene su copy: catálogo del BC vs curadas del kickoff).
 */
export async function regenerateTypedSection(
  def: BCSectionDef | undefined,
  currentData: unknown,
  instruction: string,
  opts: { brief?: string; lang?: string | null; curatedMessage?: string } = {},
): Promise<RegenTypedResult> {
  if (def?.agentGenerated === false) {
    return {
      ok: false,
      error: opts.curatedMessage ?? "Esta sección se cura a mano; no se regenera con IA.",
      status: 400,
    };
  }
  try {
    if (!def) return { ok: true, data: {} };
    const data = await regenerateSectionDataForDef(def, currentData, instruction, opts.brief ?? def.brief, opts.lang);
    return { ok: true, data };
  } catch (e) {
    console.error("[regenerate-section] error:", e);
    return { ok: false, error: "regenerate_failed", status: 500 };
  }
}
