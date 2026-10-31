/**
 * components/canvas/hoja-de-ruta-landing-adapter.ts
 *
 * Adaptador COMPARTIDO entre el editor de un artefacto (components/artefactos), su vista por enlace y su PDF. Como el del
 * plan de adopción: portada primero, cierre último, contenido en el orden vivo.
 */
import type { LandingConfig } from "@/components/landing/types";
import { buildLandingConfigFromOrder, landingRowData, type LandingSectionRow } from "@/components/landing/build-landing";
import { sintetizarSeccionCreada } from "@/components/landing/configs/templates";
import { landingConfigForHojaDeRuta } from "@/components/landing/configs/hoja-de-ruta";

const HOJA_DE_RUTA_HERO = "hoja_de_ruta";
export const HOJA_DE_RUTA_PINNED_TAIL = ["cierre"] as const;

export function buildHojaDeRutaConfig(orderedKeys: string[]): LandingConfig {
  return buildLandingConfigFromOrder(
    {
      type: "hoja-de-ruta",
      allDefs: landingConfigForHojaDeRuta().sections,
      heroKey: HOJA_DE_RUTA_HERO,
      pinnedTail: HOJA_DE_RUTA_PINNED_TAIL,
      sintetizar: sintetizarSeccionCreada,
    },
    orderedKeys,
  );
}

/** Filas → `data` por sección (CARD tipada | `{__legacyMd}` + overrides de la portada). */
export function buildHojaDeRutaSections(rows: LandingSectionRow[]): Array<{ key: string; data: unknown }> {
  return rows.map((r) => ({ key: r.key, data: landingRowData(r, HOJA_DE_RUTA_HERO) }));
}
