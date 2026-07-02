/**
 * lib/business-cases/template-meta.ts
 *
 * Entry reservada `__meta` en el Json `ProjectCanvas.sections` del canvas v0
 * ("Plantilla") de un Business Case: copia de respaldo de templateId/caseType/
 * caseSubtype que sobrevive a un `db push` ajeno que dropee las columnas del
 * setup dual-PC (misma razón por la que los briefs viven en ese Json — ver
 * section-briefs.ts).
 *
 * Contrato verificado contra los parsers de section-briefs.ts:
 * - `parseSectionEntries` la CONSERVA (tiene `key` string) y los merges de
 *   brief/hidden (server-side) la preservan intacta.
 * - NO lleva `brief` ni `hidden` (briefsByKeyFrom/hiddenKeysFrom la ignoran).
 * - No tiene fila CanvasSection → el GET de canvas-sections no la expone y
 *   LandingView jamás la renderiza.
 */

export const TEMPLATE_META_KEY = "__meta";

export interface BcTemplateMeta {
  templateId?: string;
  caseType?: string | null;
  caseSubtype?: string | null;
}

/** Lee la entry `__meta` del Json de secciones de un canvas (null si no está). */
export function templateMetaFrom(sections: unknown): BcTemplateMeta | null {
  if (!Array.isArray(sections)) return null;
  const entry = sections.find(
    (e) => e && typeof e === "object" && (e as { key?: unknown }).key === TEMPLATE_META_KEY,
  );
  if (!entry) return null;
  const m = entry as { templateId?: unknown; caseType?: unknown; caseSubtype?: unknown };
  return {
    templateId: typeof m.templateId === "string" ? m.templateId : undefined,
    caseType: typeof m.caseType === "string" ? m.caseType : null,
    caseSubtype: typeof m.caseSubtype === "string" ? m.caseSubtype : null,
  };
}

/** Construye la entry `__meta` para sembrar en el Json al crear el canvas. */
export function buildTemplateMetaEntry(meta: BcTemplateMeta): Record<string, unknown> {
  return {
    key: TEMPLATE_META_KEY,
    label: "",
    templateId: meta.templateId,
    ...(meta.caseType != null ? { caseType: meta.caseType } : {}),
    ...(meta.caseSubtype != null ? { caseSubtype: meta.caseSubtype } : {}),
  };
}
