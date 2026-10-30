/**
 * components/canvas/integracion-landing-adapter.ts
 *
 * Adaptador COMPARTIDO entre el editor de un artefacto (components/artefactos), su vista por enlace y su PDF. Wrapper
 * delgado del núcleo genérico `components/landing/build-landing.ts`, como el del requerimiento técnico: portada
 * primero, cierre último, contenido en el orden vivo. Sin secciones que lean el proyecto (ctxDriven).
 */
import type { LandingConfig } from "@/components/landing/types";
import { buildLandingConfigFromOrder, landingRowData, type LandingSectionRow } from "@/components/landing/build-landing";
import { sintetizarSeccionCreada } from "@/components/landing/configs/templates";
import { landingConfigForIntegracion } from "@/components/landing/configs/integracion";

const INTEGRACION_HERO = "requerimiento";
export const INTEGRACION_PINNED_TAIL = ["cierre"] as const;

/** Config: portada primero, `cierre` último, contenido en el orden vivo en el medio. */
export function buildIntegracionConfig(orderedKeys: string[]): LandingConfig {
  return buildLandingConfigFromOrder(
    {
      type: "integracion",
      allDefs: landingConfigForIntegracion().sections,
      heroKey: INTEGRACION_HERO,
      pinnedTail: INTEGRACION_PINNED_TAIL,
      // Las secciones CREADAS EN RUNTIME (`custom:*`) se sintetizan desde su key, como en los demás documentos.
      sintetizar: sintetizarSeccionCreada,
    },
    orderedKeys,
  );
}

/** Filas → `data` por sección (CARD tipada | `{__legacyMd}` + overrides de la portada). */
export function buildIntegracionSections(rows: LandingSectionRow[]): Array<{ key: string; data: unknown }> {
  return rows.map((r) => ({ key: r.key, data: landingRowData(r, INTEGRACION_HERO) }));
}
