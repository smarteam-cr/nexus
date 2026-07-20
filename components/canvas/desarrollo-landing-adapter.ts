/**
 * components/canvas/desarrollo-landing-adapter.ts
 *
 * Adaptador COMPARTIDO entre el editor interno (DesarrolloWorkspace) y la página
 * externa (app/external/desarrollo). Desde la Ola 5 es un wrapper delgado del
 * núcleo genérico `components/landing/build-landing.ts` — Desarrollo no tiene
 * ninguna particularidad (sin ctx-driven, sin de-dup): hero primero, cierre
 * último, contenido en el orden vivo. El golden que congela este output vive en
 * lib/landing/build-landing.test.ts.
 */
import type { LandingConfig } from "@/components/landing/types";
import {
  buildLandingConfigFromOrder,
  landingRowData,
  type LandingSectionRow,
} from "@/components/landing/build-landing";
import { landingConfigForDesarrollo } from "@/components/landing/configs/desarrollo";

const DESARROLLO_HERO = "requerimiento";
export const DESARROLLO_PINNED_TAIL = ["cierre"] as const;

/** Fila de sección tal como llega del hook (vivo) o del snapshot (externo). */
export type DesarrolloSectionRow = LandingSectionRow;

/** Config: hero primero, `cierre` último, contenido en el orden vivo en el medio. */
export function buildDesarrolloConfig(orderedKeys: string[]): LandingConfig {
  return buildLandingConfigFromOrder(
    {
      type: "desarrollo",
      allDefs: landingConfigForDesarrollo().sections,
      heroKey: DESARROLLO_HERO,
      pinnedTail: DESARROLLO_PINNED_TAIL,
    },
    orderedKeys,
  );
}

/** `data` de una sección para el motor (CARD tipada | `{__legacyMd}` + overrides del hero). */
export function desarrolloSectionData(row: DesarrolloSectionRow): unknown {
  return landingRowData(row, DESARROLLO_HERO);
}

/** Filas → `data` por sección, para las DOS superficies (editor + externa). */
export function buildDesarrolloSections(rows: DesarrolloSectionRow[]): Array<{ key: string; data: unknown }> {
  return rows.map((r) => ({ key: r.key, data: desarrolloSectionData(r) }));
}
