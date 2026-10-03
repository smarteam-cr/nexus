/**
 * lib/escala/areas-por-hub.ts — qué área de la escala corresponde a cada hub contratado.
 *
 * Las áreas de la escala se identifican por número estable (`1` Ventas, `2` Marketing, `3` Servicio:
 * el mismo mapa que usa el test en línea, lib/exploraciones/test-de-marketing.ts). Los nombres NO
 * se escriben acá: salen de la escala publicada. Lo único fijo es qué hub enciende qué número.
 *
 * Módulo PURO (lo usan el servidor y la pantalla).
 */
import type { HubspotHubSlug } from "@/lib/tags/catalog";

export const AREA_POR_HUB: Readonly<Partial<Record<HubspotHubSlug, string>>> = {
  sales_hub: "1",
  marketing_hub: "2",
  service_hub: "3",
};

/** Las áreas de la escala que corresponden a los tags del proyecto, en el orden de la escala. */
export function areasContratadas(tags: readonly string[]): string[] {
  const set = new Set(tags);
  return Object.entries(AREA_POR_HUB)
    .filter(([hub]) => set.has(hub))
    .map(([, area]) => area as string)
    .sort();
}
