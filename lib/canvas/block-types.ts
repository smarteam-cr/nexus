// ── Canvas Block Type System ─────────────────────────────────────────────────
// Base para el futuro Page Editor. Define los tipos de bloque que los agentes
// pueden generar y que el canvas puede renderizar.
// Extensible: agregar nuevos tipos solo requiere agregar a BLOCK_TYPES y su interface.

export const BLOCK_TYPES = [
  "text",
  "heading",
  "table",
  "metric",
  "callout",
  "card",
  "flowchart",
  "chart",
  "image",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

// ── Interfaces por tipo ─────────────────────────────────────────────────────

/** Markdown libre */
export interface TextBlock {
  type: "text";
  content: string;
}

/** Heading (h2 o h3) */
export interface HeadingBlock {
  type: "heading";
  level: 2 | 3;
  content: string;
}

/** Tabla estructurada */
export interface TableBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

/** KPI / métrica individual */
export interface MetricBlock {
  type: "metric";
  label: string;
  value: string;
  trend?: "up" | "down" | "flat";
  comparison?: string; // e.g. "vs 2.1% anterior"
}

/** Callout / alerta destacada */
export interface CalloutBlock {
  type: "callout";
  variant: "info" | "warning" | "success" | "error";
  title?: string;
  content: string;
}

/** Card de texto (backward compatible con el sistema actual) */
export interface CardBlock {
  type: "card";
  title: string;
  content: string;
}

/** Diagrama React Flow */
export interface FlowchartBlock {
  type: "flowchart";
  title?: string;
  nodes: unknown[];
  edges: unknown[];
}

/** Gráfico ECharts */
export interface ChartBlock {
  type: "chart";
  chartType: string; // "bar", "line", "pie", "scatter", "radar", etc.
  config: Record<string, unknown>; // ECharts option object
}

/** Imagen */
export interface ImageBlock {
  type: "image";
  url: string;
  alt?: string;
  caption?: string;
}

// ── Union type ──────────────────────────────────────────────────────────────

export type CanvasBlock =
  | TextBlock
  | HeadingBlock
  | TableBlock
  | MetricBlock
  | CalloutBlock
  | CardBlock
  | FlowchartBlock
  | ChartBlock
  | ImageBlock;

// ── Validators ──────────────────────────────────────────────────────────────

export function isValidBlockType(type: string): type is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(type);
}
