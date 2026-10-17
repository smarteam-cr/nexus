/**
 * lib/business-cases/casos-para-la-propuesta.ts — qué lleva la sección «Casos de uso» de una propuesta nueva. PURO.
 *
 * Ficha B (2026-10-17, roadmap «Ventas», pasos 1 y 2). La sección `casos_de_uso` es determinística (la escribe el
 * generate, nunca el agente). Antes solo la llenaba el checklist del catálogo con precio (la tabla `UseCase`), que en
 * producción está vacía: toda propuesta nueva salía sin casos de uso. Ahora, en este orden:
 *   1. lo marcado en el checklist (con su precio exacto);
 *   2. lo elegido en la preventa de la que nace (los del catálogo con lo que gana el cliente; los libres con su
 *      descripción), sin repetir un título;
 *   3. si no hay nada de lo anterior, los SUGERIDOS de la biblioteca (lib/casos-de-uso/camino.ts): con la escala de la
 *      empresa, los que destraban lo que la frena; sin escala, los que aterrizan cada área en juego.
 * Los sugeridos van marcados como tales en el preámbulo del agente; la persona los revisa antes de subir la propuesta.
 */
import type { CasoDelCatalogo } from "@/lib/casos-de-uso/catalogo";
import type { SelectedUseCase } from "./use-cases";

export interface ItemDeCasoDeUso {
  title: string;
  detail: string;
  price: string;
}

export type OrigenDeLosCasos = "checklist" | "preventa" | "sugeridos" | "ninguno";

const clave = (t: string) => t.trim().toLowerCase();

export function itemsDeLaSeccionDeCasos(o: {
  checklist: readonly SelectedUseCase[];
  preventa: readonly ItemDeCasoDeUso[];
  sugeridos: readonly CasoDelCatalogo[];
}): { items: ItemDeCasoDeUso[]; origen: OrigenDeLosCasos } {
  const items: ItemDeCasoDeUso[] = o.checklist.map((u) => ({ title: u.title, detail: u.description, price: u.price }));
  const vistos = new Set(items.map((i) => clave(i.title)));
  for (const p of o.preventa) {
    if (!p.title.trim() || vistos.has(clave(p.title))) continue;
    vistos.add(clave(p.title));
    items.push({ title: p.title, detail: p.detail, price: p.price });
  }
  if (items.length) return { items, origen: o.checklist.length ? "checklist" : "preventa" };
  const sugeridos = o.sugeridos.map((c) => ({ title: c.titulo, detail: c.promesa, price: "" }));
  return { items: sugeridos, origen: sugeridos.length ? "sugeridos" : "ninguno" };
}

/** Las líneas del preámbulo del agente para los casos que no salieron del checklist (sin precio: es la fase 2). */
export function preambuloDeCasos(origen: OrigenDeLosCasos, items: readonly ItemDeCasoDeUso[]): string | null {
  if (origen !== "preventa" && origen !== "sugeridos") return null;
  const encabezado =
    origen === "preventa"
      ? "# Casos de uso elegidos en la preventa\nEl vendedor eligió estos casos de uso con el prospecto. La sección de casos de uso se arma aparte con estos títulos: tenlos en cuenta al redactar (menciónalos donde aporten) y NO inventes otros."
      : "# Casos de uso que sugiere Smarteam\nSalen de la biblioteca de casos de uso, según dónde está la empresa en la escala o el área que se aterriza. La sección se arma aparte con estos títulos: puedes mencionarlos donde aporten, sin afirmar que el prospecto ya los eligió, y NO inventes otros.";
  return `${encabezado}\n${items.map((i) => `- ${i.title}${i.detail ? `: ${i.detail}` : ""}`).join("\n")}`;
}
