/**
 * components/canvas/entrega-landing-adapter.ts
 *
 * Adaptador del canvas "Entrega" (filas de CanvasSection → data del motor). Wrapper delgado
 * del núcleo genérico `components/landing/build-landing.ts`, igual que el de Implementación:
 * portada primero, cierre último, contenido en el orden vivo del CSE.
 *
 * UN adaptador, TRES superficies: el workspace del CSE, la vista externa del cliente y el
 * PDF. Es la regla del motor (§1-WEB) y acá pesa más que en ningún otro documento: lo que el
 * CSE revisa antes de entregar tiene que ser exactamente lo que el cliente recibe.
 */
import type { LandingConfig } from "@/components/landing/types";
import {
  buildLandingConfigFromOrder,
  landingRowData,
  type LandingSectionRow,
} from "@/components/landing/build-landing";
import { sintetizarSeccionCreada } from "@/components/landing/configs/templates";
import { landingConfigForEntrega } from "@/components/landing/configs/entrega";

const ENTREGA_HERO = "portada";
export const ENTREGA_PINNED_TAIL = ["cierre"] as const;

/** Fila de sección tal como llega del hook `useCanvasSections`. */
export type EntregaSectionRow = LandingSectionRow;

/** Config: portada primero, `cierre` último, contenido en el orden vivo en el medio. */
export function buildEntregaConfig(orderedKeys: string[]): LandingConfig {
  return buildLandingConfigFromOrder(
    {
      type: "entrega",
      allDefs: landingConfigForEntrega().sections,
      heroKey: ENTREGA_HERO,
      pinnedTail: ENTREGA_PINNED_TAIL,
      /* Las secciones CREADAS EN RUNTIME no están en la plantilla: se sintetizan desde su
         key. Sin esto se caen del render, y se caen igual en el editor y en el PDF. */
      sintetizar: sintetizarSeccionCreada,
    },
    orderedKeys,
  );
}

/** `data` de una sección para el motor (CARD tipada | `{__legacyMd}` + overrides de la portada). */
export function entregaSectionData(row: EntregaSectionRow): unknown {
  return landingRowData(row, ENTREGA_HERO);
}

/** Filas → `data` por sección. */
export function buildEntregaSections(rows: EntregaSectionRow[]): Array<{ key: string; data: unknown }> {
  return rows.map((r) => ({ key: r.key, data: entregaSectionData(r) }));
}
