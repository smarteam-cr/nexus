/**
 * components/canvas/diagnostico-landing-adapter.ts
 *
 * Adaptador del canvas "Diagnóstico" (filas de CanvasSection → data del motor). Wrapper
 * delgado del núcleo genérico `components/landing/build-landing.ts`, igual que el de
 * Exploración: hero primero, cierre último, contenido en el orden vivo del CSE.
 *
 * Las secciones legacy con markdown (los diagnósticos viejos) llegan sin bloque CARD:
 * `landingRowData` las rinde vía `{__legacyMd}` — por eso el contenido de esos proyectos
 * sigue visible aunque la pieza haya pasado al motor.
 */
import type { LandingConfig } from "@/components/landing/types";
import {
  buildLandingConfigFromOrder,
  landingRowData,
  type LandingSectionRow,
} from "@/components/landing/build-landing";
import { sintetizarSeccionCreada } from "@/components/landing/configs/templates";
import { landingConfigForDiagnostico } from "@/components/landing/configs/diagnostico";

const DIAGNOSTICO_HERO = "diagnostico";
export const DIAGNOSTICO_PINNED_TAIL = ["cierre"] as const;

/** Fila de sección tal como llega del hook `useCanvasSections`. */
export type DiagnosticoSectionRow = LandingSectionRow;

/** Config: hero primero, `cierre` último, contenido en el orden vivo en el medio. */
export function buildDiagnosticoConfig(orderedKeys: string[]): LandingConfig {
  return buildLandingConfigFromOrder(
    {
      type: "diagnostico",
      allDefs: landingConfigForDiagnostico().sections,
      heroKey: DIAGNOSTICO_HERO,
      pinnedTail: DIAGNOSTICO_PINNED_TAIL,
      /* Las secciones CREADAS EN RUNTIME no están en la plantilla: se sintetizan desde su
         key. Sin esto se caen del render, y se caen igual en el editor y en el PDF. */
      sintetizar: sintetizarSeccionCreada,
    },
    orderedKeys,
  );
}

/** `data` de una sección para el motor (CARD tipada | `{__legacyMd}` + overrides del hero). */
export function diagnosticoSectionData(row: DiagnosticoSectionRow): unknown {
  return landingRowData(row, DIAGNOSTICO_HERO);
}

/** Filas → `data` por sección. */
export function buildDiagnosticoSections(rows: DiagnosticoSectionRow[]): Array<{ key: string; data: unknown }> {
  return rows.map((r) => ({ key: r.key, data: diagnosticoSectionData(r) }));
}
