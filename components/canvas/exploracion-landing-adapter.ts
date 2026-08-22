/**
 * components/canvas/exploracion-landing-adapter.ts
 *
 * Adaptador del canvas "Exploración" (filas de CanvasSection → data del motor). Wrapper
 * delgado del núcleo genérico `components/landing/build-landing.ts`, igual que el de
 * Desarrollo: Exploración no tiene ninguna particularidad (sin ctx-driven, sin de-dup) —
 * hero primero, cierre último, contenido en el orden vivo del CSE.
 *
 * A diferencia de kickoff/desarrollo, este adaptador tiene UNA sola superficie: el editor
 * interno. NO existe página externa que lo consuma, y no debe existir — ver
 * `lib/canvas/exploracion-internal.test.ts`.
 */
import type { LandingConfig } from "@/components/landing/types";
import {
  buildLandingConfigFromOrder,
  landingRowData,
  type LandingSectionRow,
} from "@/components/landing/build-landing";
import { sintetizarSeccionCreada } from "@/components/landing/configs/templates";
import { landingConfigForExploracion } from "@/components/landing/configs/exploracion";

const EXPLORACION_HERO = "exploracion";
export const EXPLORACION_PINNED_TAIL = ["cierre"] as const;

/** Fila de sección tal como llega del hook `useCanvasSections`. */
export type ExploracionSectionRow = LandingSectionRow;

/** Config: hero primero, `cierre` último, contenido en el orden vivo en el medio. */
export function buildExploracionConfig(orderedKeys: string[]): LandingConfig {
  return buildLandingConfigFromOrder(
    {
      type: "exploracion",
      allDefs: landingConfigForExploracion().sections,
      heroKey: EXPLORACION_HERO,
      pinnedTail: EXPLORACION_PINNED_TAIL,
      /* Las secciones CREADAS EN RUNTIME no están en la plantilla: se sintetizan desde su
         key. Sin esto se caen del render, y se caen igual en el editor y en el PDF. */
      sintetizar: sintetizarSeccionCreada,
    },
    orderedKeys,
  );
}

/** `data` de una sección para el motor (CARD tipada | `{__legacyMd}` + overrides del hero). */
export function exploracionSectionData(row: ExploracionSectionRow): unknown {
  return landingRowData(row, EXPLORACION_HERO);
}

/** Filas → `data` por sección. */
export function buildExploracionSections(rows: ExploracionSectionRow[]): Array<{ key: string; data: unknown }> {
  return rows.map((r) => ({ key: r.key, data: exploracionSectionData(r) }));
}
