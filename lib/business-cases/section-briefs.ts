/**
 * lib/business-cases/section-briefs.ts
 *
 * El "brief" por sección (la guía que el agente lee al generar esa sección, editable
 * por el CSE) vive en `ProjectCanvas.sections` (Json: `[{key,label,brief?,previousBrief?}]`),
 * NO en una columna de `CanvasSection`.
 *
 * Por qué: el setup de 2 PCs comparte la DB de prod. Una columna nueva agregada en una
 * PC la dropea cualquier `db push` corrido desde la otra PC (cuyo schema no la tiene).
 * Guardándolo en un Json que YA existe (sembrado en `createBusinessCaseCanvas`), el brief
 * sobrevive cualquier `db push` sin depender de que el cambio de schema esté pusheado.
 *
 * Granularidad: por (canvas, key) — igual que cuando vivía en la fila CanvasSection.
 */

export interface CanvasSectionEntry {
  key: string;
  label: string;
  /** Guía del agente editada por el CSE. null/ausente = brief por defecto de la config. */
  brief?: string | null;
  /** Valor anterior del brief para el deshacer de 1 nivel (toggle). */
  previousBrief?: string | null;
  /** El CSE ocultó esta sección: no se publica al cliente (reversible, no borra datos). */
  hidden?: boolean;
}

/**
 * ── KEY RESERVADA: "__doc" — las instrucciones del CSE para el DOCUMENTO entero ──
 * (Tanda X1, 2026-08-08.) Además de los briefs por sección, un canvas puede llevar UNA entry
 * con `key: "__doc"`: la instrucción libre del CSE para la IA de esa pieza («las fases de QA
 * van al final», «no menciones el módulo X»). Nació para el cronograma y es extensible gratis
 * a cualquier pieza, porque toda pieza tiene canvas.
 *
 * Vive en este Json y NO en una columna a propósito — el mismo motivo del header: sobrevive
 * cualquier `db push` del setup two-PC. ⚠ El doble guion bajo es el contrato de «no soy una
 * sección»: ninguna UI debe listarla como sección ni ningún generador tratarla como key de
 * canvas (las keys reales nunca empiezan con "__").
 */
export const DOC_BRIEF_KEY = "__doc";

/** El brief del DOCUMENTO (entry `__doc`), o null. Tolerante a basura como todo acá. */
export function docBriefFrom(sections: unknown): string | null {
  const e = parseSectionEntries(sections).find((x) => x.key === DOC_BRIEF_KEY);
  const brief = typeof e?.brief === "string" ? e.brief.trim() : "";
  return brief || null;
}

/**
 * El bloque de prompt de las instrucciones del documento. "" si no hay — así el golden
 * «proyecto sin brief ⇒ userMessage byte-idéntico» se sostiene por construcción.
 * El rótulo viaja ADENTRO (principio del repo: la procedencia no se puede perder por
 * descuido en un call site).
 */
export function bloqueDeInstruccionesDeDoc(brief: string | null): string {
  const b = brief?.trim();
  if (!b) return "";
  return `=== INSTRUCCIONES DEL CSE PARA ESTA PIEZA (reglas duras — cumplilas SIEMPRE) ===\n${b}\n\n`;
}

/** Lee el array de secciones del Json de un ProjectCanvas, tolerante a basura/forma vieja. */
export function parseSectionEntries(sections: unknown): CanvasSectionEntry[] {
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((e) =>
    e && typeof e === "object" && typeof (e as { key?: unknown }).key === "string"
      ? [e as CanvasSectionEntry]
      : [],
  );
}

/** Mapa key → brief efectivo (solo overrides no vacíos), para alimentar al agente. */
export function briefsByKeyFrom(sections: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of parseSectionEntries(sections)) {
    if (typeof e.brief === "string" && e.brief.trim()) out[e.key] = e.brief.trim();
  }
  return out;
}

/** Set de keys de sección OCULTAS (el cliente no las ve). */
export function hiddenKeysFrom(sections: unknown): Set<string> {
  const out = new Set<string>();
  for (const e of parseSectionEntries(sections)) {
    if (e.hidden === true) out.add(e.key);
  }
  return out;
}

/** Merge inmutable de un patch parcial en la entry de `key` (la crea si falta). */
export function patchSectionEntry(
  sections: unknown,
  key: string,
  patch: Partial<CanvasSectionEntry>,
): CanvasSectionEntry[] {
  const entries = parseSectionEntries(sections);
  const idx = entries.findIndex((e) => e.key === key);
  if (idx === -1) return [...entries, { key, label: key, ...patch }];
  return entries.map((e, i) => (i === idx ? { ...e, ...patch } : e));
}

/**
 * Devuelve un nuevo array de entries con el brief (+ previousBrief) de `key` actualizado.
 * Si la entry no existe (canvas viejo sin esa key), la crea. Inmutable.
 */
export function withBriefUpdated(
  sections: unknown,
  key: string,
  brief: string | null,
  previousBrief: string | null,
): CanvasSectionEntry[] {
  const entries = parseSectionEntries(sections);
  const idx = entries.findIndex((e) => e.key === key);
  if (idx === -1) return [...entries, { key, label: key, brief, previousBrief }];
  return entries.map((e, i) => (i === idx ? { ...e, brief, previousBrief } : e));
}
