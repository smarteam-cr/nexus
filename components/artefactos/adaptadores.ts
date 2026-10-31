/**
 * components/artefactos/adaptadores.ts — EL ADAPTADOR DEL MOTOR DE CADA TIPO DE ARTEFACTO (etapas V3 y V4 de
 * docs/artefactos-plan.md). Client-safe.
 *
 * Una copia se pinta con el MISMO adaptador que el documento de siempre de su tipo (el que comparten su editor, su vista
 * externa y su PDF): así una copia de planificación se ve como una planificación. Lo usan tres superficies, y las tres
 * tienen que ver lo mismo (ARCHITECTURE §1-WEB punto 6): el editor de una copia (components/artefactos), su enlace
 * (components/external/ArtefactoClientView.tsx) y su PDF (components/print/PrintDocView.tsx tiene su propio mapa por
 * tipo de impresión, con los mismos builders).
 *
 * Un tipo sin adaptador es null: quien llama no lo pinta (nunca cae al de otro tipo).
 */
import type { LandingConfig, LandingContext } from "@/components/landing/types";
import type { LandingSectionRow } from "@/components/landing/build-landing";
import { buildKickoffConfig, buildKickoffSections } from "@/components/canvas/kickoff-landing-adapter";
import { buildDiagnosticoConfig, buildDiagnosticoSections, ctxDelDiagnostico } from "@/components/canvas/diagnostico-landing-adapter";
import { buildPlanificacionConfig, buildPlanificacionSections } from "@/components/canvas/planificacion-landing-adapter";
import { buildExploracionConfig, buildExploracionSections } from "@/components/canvas/exploracion-landing-adapter";
import { buildAdopcionConfig, buildAdopcionSections } from "@/components/canvas/adopcion-landing-adapter";
import { buildIntegracionConfig, buildIntegracionSections } from "@/components/canvas/integracion-landing-adapter";
import { buildHojaDeRutaConfig, buildHojaDeRutaSections } from "@/components/canvas/hoja-de-ruta-landing-adapter";
import { buildEntregaConfig, buildEntregaSections } from "@/components/canvas/entrega-landing-adapter";
import { buildImplementacionConfig, buildImplementacionSections } from "@/components/canvas/implementacion-landing-adapter";
import { TIPO_HOJA_DE_RUTA, TIPO_REQUERIMIENTO_TECNICO, TIPO_PLAN_DE_ADOPCION } from "@/lib/artefactos/tipos";

export interface AdaptadorDelTipo {
  config: (orderedKeys: string[]) => LandingConfig;
  sections: (rows: LandingSectionRow[]) => Array<{ key: string; data: unknown }>;
  /** Lo que el documento arma en `ctx` desde SUS secciones (hoy, el diagnóstico). */
  ctx?: (sections: ReadonlyArray<{ key: string; data: unknown }>) => Partial<LandingContext>;
  /**
   * La paleta del motor EN EL EDITOR y en el PDF (lib/print/doc-types.ts): la planificación y la exploración van en la
   * interna. La vista del cliente va siempre en la de marca, como sus superficies de siempre.
   */
  palette: "brand" | "internal";
}

const ADAPTADORES: Readonly<Record<string, AdaptadorDelTipo>> = {
  kickoff: { config: buildKickoffConfig, sections: buildKickoffSections, palette: "brand" },
  diagnosis: {
    config: buildDiagnosticoConfig,
    sections: buildDiagnosticoSections,
    ctx: (sections) => ({ diagnostico: ctxDelDiagnostico(sections) }),
    palette: "brand",
  },
  planning: { config: buildPlanificacionConfig, sections: buildPlanificacionSections, palette: "internal" },
  exploration: { config: buildExploracionConfig, sections: buildExploracionSections, palette: "internal" },
  [TIPO_PLAN_DE_ADOPCION]: { config: buildAdopcionConfig, sections: buildAdopcionSections, palette: "brand" },
  [TIPO_REQUERIMIENTO_TECNICO]: { config: buildIntegracionConfig, sections: buildIntegracionSections, palette: "brand" },
  [TIPO_HOJA_DE_RUTA]: { config: buildHojaDeRutaConfig, sections: buildHojaDeRutaSections, palette: "brand" },
  delivery: { config: buildEntregaConfig, sections: (rows) => buildEntregaSections(rows as never), palette: "brand" },
  implementation: { config: buildImplementacionConfig, sections: (rows) => buildImplementacionSections(rows as never), palette: "internal" },
};

export function adaptadorDelTipo(tipo: string | null | undefined): AdaptadorDelTipo | null {
  return tipo ? (ADAPTADORES[tipo] ?? null) : null;
}
