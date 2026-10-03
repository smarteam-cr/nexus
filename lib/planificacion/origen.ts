/**
 * lib/planificacion/origen.ts — de dónde sale cada cosa de la Planificación (2026-10-02).
 *
 * La Planificación es lo que va a quedar configurado en HubSpot, y Caroline la presenta al cliente
 * antes de configurar. Por eso cada paso, etapa, propiedad, automatización y conversación dice si se
 * ACORDÓ en una reunión con el cliente (y cuál), si es una PROPUESTA de Smarteam, o si es un SUPUESTO
 * (nadie lo dijo y el agente lo dio por hecho). Lo que viene solo de una nota interna no cuenta como
 * acordado: queda como propuesta o supuesto.
 *
 * Puro (sin React ni Prisma): lo leen los renderers, la migración y las pruebas.
 */

export const ORIGENES = [
  { value: "acordado", label: "Acordado" },
  { value: "propuesta", label: "Propuesta" },
  { value: "supuesto", label: "Supuesto" },
] as const;

export type Origen = (typeof ORIGENES)[number]["value"];

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Lleva lo que escribió el agente (o una persona) al vocabulario. Tolera variantes («Acordada»,
 * «inferido», «propuesto»). Lo que no se reconoce devuelve "": sin chip, en vez de adivinar.
 */
export function normalizarOrigen(v: unknown): Origen | "" {
  if (typeof v !== "string") return "";
  const t = sinTildes(v).trim().toLowerCase();
  if (!t) return "";
  if (t.startsWith("acord") || t.startsWith("confirm")) return "acordado";
  if (t.startsWith("supu") || t.startsWith("infer") || t.startsWith("asum")) return "supuesto";
  if (t.startsWith("propu") || t.startsWith("propo")) return "propuesta";
  return "";
}

export function etiquetaDeOrigen(v: unknown): string {
  const o = normalizarOrigen(v);
  return ORIGENES.find((x) => x.value === o)?.label ?? "";
}
