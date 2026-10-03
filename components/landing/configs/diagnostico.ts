/**
 * components/landing/configs/diagnostico.ts
 *
 * Lado CLIENT del registry del canvas "Diagnóstico": mapa `sectionType → componente` +
 * `landingConfigForDiagnostico()`. Espeja `configs/exploracion.ts`. Las defs server-safe
 * viven en `diagnostico.defs.ts`.
 *
 * Componentes PROPIOS (sections-diagnostico.tsx): los del hilo con códigos — objetivos, explicación
 * del problema y preguntas, desde el 2026-09-28 —, y desde el 2026-10-02 la política rectora con su
 * revisión, equipos y licencias y el alcance acordado. Las acciones y las herramientas usan los de
 * la Ejecución (sections-ejecucion.tsx). El resto se rinde con renderers YA construidos del motor —
 *   · `hero` del Business Case (de cara al cliente: brand row + portada),
 *   · `process_mapping` para el "cómo opera hoy vs cómo va a operar",
 *   · `escala_posicion` para la Escala 5.2 por capa (compartido con Propuesta, Kickoff y Entrega),
 *   · `pain` para las causas, `web_diagnosis` para la brecha,
 *   · `kickoff_prose` para contexto/recomendaciones (y las legacy solo-lectura),
 *   · `kickoff_cta` para el cierre.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { DIAGNOSTICO_SECTION_DEFS } from "./diagnostico.defs";
import { toSectionDef } from "./templates";
import { PainSection } from "../sections";
import { WebDiagnosisSection } from "../sections-website";
import { ProcessMappingSection } from "../sections-shared";
import { EscalaPosicionSection } from "../sections-escala";
import { KickoffProseSection, KickoffCtaSection } from "@/components/canvas/kickoff-sections/KickoffSections";
import {
  ObjetivosDiagnosticoSection,
  ProblemaDiagnosticoSection,
  PreguntasDiagnosticoSection,
  PoliticaDiagnosticoSection,
  EquiposDiagnosticoSection,
  AlcanceDiagnosticoSection,
  DiagnosticoHeroSection,
} from "../sections-diagnostico";
import { AccionesEjecucionSection, HerramientasEjecucionSection } from "../sections-ejecucion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DIAGNOSTICO_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  // La portada del BC + la línea «Cliente · Fecha · Versión · Estado» de FUNDAUNA (2026-10-02).
  diagnostico_portada: DiagnosticoHeroSection,
  kickoff_prose: KickoffProseSection,
  process_mapping: ProcessMappingSection,
  // La posición en la Escala 5.2, por capa. Adentro pinta con la grilla de métricas los
  // diagnósticos viejos que guardaron tarjetas «N/5» (ver sections-escala.tsx).
  escala_posicion: EscalaPosicionSection,
  pain: PainSection,
  web_diagnosis: WebDiagnosisSection,
  kickoff_cta: KickoffCtaSection,
  // El HILO (2026-09-28): objetivos OBJ, síntomas S → causas F → consecuencias, y las preguntas.
  diagnostico_objetivos: ObjetivosDiagnosticoSection,
  diagnostico_problema: ProblemaDiagnosticoSection,
  diagnostico_preguntas: PreguntasDiagnosticoSection,
  // El contrato de FUNDAUNA (2026-10-02): la política rectora con su revisión, las acciones y las
  // herramientas (renderers de la Ejecución, de donde vinieron), equipos y licencias, y el alcance.
  diagnostico_politica: PoliticaDiagnosticoSection,
  ejecucion_acciones: AccionesEjecucionSection,
  ejecucion_herramientas: HerramientasEjecucionSection,
  diagnostico_equipos: EquiposDiagnosticoSection,
  diagnostico_alcance: AlcanceDiagnosticoSection,
};

const DIAGNOSTICO_LANDING_CONFIG: LandingConfig = {
  type: "diagnostico",
  sections: DIAGNOSTICO_SECTION_DEFS.map((d) => toSectionDef(d, DIAGNOSTICO_SECTION_COMPONENTS)).filter(
    (s): s is SectionDef => s !== null,
  ),
};

/** Config completa del canvas Diagnóstico (todas las secciones en orden canónico). */
export function landingConfigForDiagnostico(): LandingConfig {
  return DIAGNOSTICO_LANDING_CONFIG;
}
