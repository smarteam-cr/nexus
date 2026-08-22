/**
 * components/canvas/planificacion-landing-adapter.ts
 *
 * Adaptador del canvas "Planificación" (filas de CanvasSection → data del motor). Wrapper
 * delgado del núcleo genérico `components/landing/build-landing.ts`, igual que el de
 * Exploración: hero primero, cierre último, contenido en el orden vivo del CSE.
 *
 * Las secciones legacy con markdown (las planificaciones viejas) llegan sin bloque CARD:
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
import { landingConfigForPlanificacion } from "@/components/landing/configs/planificacion";

const PLANIFICACION_HERO = "planificacion";
export const PLANIFICACION_PINNED_TAIL = ["cierre"] as const;

/** Fila de sección tal como llega del hook `useCanvasSections`. */
export type PlanificacionSectionRow = LandingSectionRow;

/** Config: hero primero, `cierre` último, contenido en el orden vivo en el medio. */
export function buildPlanificacionConfig(orderedKeys: string[]): LandingConfig {
  return buildLandingConfigFromOrder(
    {
      type: "planificacion",
      allDefs: landingConfigForPlanificacion().sections,
      heroKey: PLANIFICACION_HERO,
      pinnedTail: PLANIFICACION_PINNED_TAIL,
      /* Las secciones CREADAS EN RUNTIME no están en la plantilla: se sintetizan desde su
         key. Sin esto se caen del render, y se caen igual en el editor y en el PDF. */
      sintetizar: sintetizarSeccionCreada,
    },
    orderedKeys,
  );
}

/** `data` de una sección para el motor (CARD tipada | `{__legacyMd}` + overrides del hero). */
export function planificacionSectionData(row: PlanificacionSectionRow): unknown {
  return landingRowData(row, PLANIFICACION_HERO);
}

/** Filas → `data` por sección. */
export function buildPlanificacionSections(rows: PlanificacionSectionRow[]): Array<{ key: string; data: unknown }> {
  return rows.map((r) => ({ key: r.key, data: planificacionSectionData(r) }));
}
