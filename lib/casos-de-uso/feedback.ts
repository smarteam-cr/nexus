/**
 * lib/casos-de-uso/feedback.ts — sugerir un cambio en un caso del catálogo o proponer uno nuevo. PURO.
 *
 * Las dos cosas llegan a la bandeja de Feedback como un reporte común: no hay columna para anclarlo a un caso
 * (el catálogo vive en el repo, no en la base). Lo que dice de qué caso y de qué parte va al principio del texto,
 * con una forma fija, y la dirección del reporte es la página del caso (`/sales/use-cases/<id>`).
 */
import type { AreaDeLaEscala, Herramienta } from "./catalogo";

export type SobreElCatalogo = { modo: "cambio"; casoId: string; titulo: string } | { modo: "nuevo" };

export const PARTES_DEL_CASO = [
  "El caso entero",
  "Lo que dice el cliente",
  "Lo que obtiene",
  "Lo que mueve en la escala",
  "Cuándo conviene",
  "Antes hace falta",
] as const;
export type ParteDelCaso = (typeof PARTES_DEL_CASO)[number];

/** El encabezado con que empieza todo reporte del catálogo: así se reconoce en la bandeja. */
export const ENCABEZADO_DEL_CATALOGO = "Catálogo de casos de uso";

export function cuerpoDeLaSugerencia(caso: { casoId: string; titulo: string }, parte: ParteDelCaso, texto: string): string {
  return `[${ENCABEZADO_DEL_CATALOGO} · «${caso.titulo}» (${caso.casoId}) · ${parte}]\n\n${texto.trim()}`;
}

export interface PropuestaDeCaso {
  resultado: string;
  frases: string;
  areas: (AreaDeLaEscala | "no-se")[];
  herramientas: Herramienta[];
  cliente: string;
}

const NOMBRE_DEL_AREA: Record<AreaDeLaEscala | "no-se", string> = { "1": "Ventas", "2": "Marketing", "3": "Servicio", "no-se": "No sé" };
const NOMBRE_DE_LA_HERRAMIENTA: Record<Herramienta, string> = { hubspot: "HubSpot", insider: "Insider", smarteam: "Solo Smarteam" };

/** Le falta lo único obligatorio: qué consigue el cliente. */
export function propuestaIncompleta(p: PropuestaDeCaso): boolean {
  return p.resultado.trim().length < 3;
}

export function cuerpoDeLaPropuesta(p: PropuestaDeCaso): string {
  const frases = p.frases
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  const lineas = [`[${ENCABEZADO_DEL_CATALOGO} · Un caso nuevo]`, "", `Qué consigue el cliente: ${p.resultado.trim()}`];
  if (frases.length) lineas.push("Qué dice el cliente cuando lo necesita:", ...frases.map((f) => `- ${f}`));
  if (p.areas.length) lineas.push(`Qué área mejora: ${p.areas.map((a) => NOMBRE_DEL_AREA[a]).join(", ")}`);
  if (p.herramientas.length) lineas.push(`Con qué herramienta: ${p.herramientas.map((h) => NOMBRE_DE_LA_HERRAMIENTA[h]).join(", ")}`);
  if (p.cliente.trim()) lineas.push(`Con qué cliente salió: ${p.cliente.trim()}`);
  return lineas.join("\n");
}
