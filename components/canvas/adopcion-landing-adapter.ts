/**
 * components/canvas/adopcion-landing-adapter.ts
 *
 * Adaptador COMPARTIDO entre el editor de un artefacto (components/artefactos), su vista por enlace y su PDF. Wrapper
 * delgado del núcleo genérico `components/landing/build-landing.ts`, como el del requerimiento técnico: portada
 * primero, cierre último, contenido en el orden vivo. Sin secciones que lean el proyecto (ctxDriven).
 */
import type { LandingConfig } from "@/components/landing/types";
import { buildLandingConfigFromOrder, landingRowData, type LandingSectionRow } from "@/components/landing/build-landing";
import { sintetizarSeccionCreada } from "@/components/landing/configs/templates";
import { landingConfigForAdopcion } from "@/components/landing/configs/adopcion";

const ADOPCION_HERO = "adopcion";
export const ADOPCION_PINNED_TAIL = ["cierre"] as const;

/** Config: portada primero, `cierre` último, contenido en el orden vivo en el medio. */
export function buildAdopcionConfig(orderedKeys: string[]): LandingConfig {
  return buildLandingConfigFromOrder(
    {
      type: "adopcion",
      allDefs: landingConfigForAdopcion().sections,
      heroKey: ADOPCION_HERO,
      pinnedTail: ADOPCION_PINNED_TAIL,
      // Las secciones CREADAS EN RUNTIME (`custom:*`) se sintetizan desde su key, como en los demás documentos.
      sintetizar: sintetizarSeccionCreada,
    },
    orderedKeys,
  );
}

/** Filas → `data` por sección (CARD tipada | `{__legacyMd}` + overrides de la portada). */
export function buildAdopcionSections(rows: LandingSectionRow[]): Array<{ key: string; data: unknown }> {
  return rows.map((r) => ({ key: r.key, data: landingRowData(r, ADOPCION_HERO) }));
}
