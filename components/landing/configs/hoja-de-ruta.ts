/**
 * components/landing/configs/hoja-de-ruta.ts
 *
 * Lado CLIENT del registry de la HOJA DE RUTA: reusa el mapa de componentes del plan de adopción (portada, cierre y tablas).
 * Las defs server-safe viven en `hoja-de-ruta.defs.ts`.
 */
import type { LandingConfig, SectionDef } from "../types";
import { HOJA_DE_RUTA_SECTION_DEFS } from "./hoja-de-ruta.defs";
import { ADOPCION_SECTION_COMPONENTS } from "./adopcion";
import { toSectionDef } from "./templates";

const HOJA_DE_RUTA_LANDING_CONFIG: LandingConfig = {
  type: "hoja-de-ruta",
  sections: HOJA_DE_RUTA_SECTION_DEFS.map((d) => toSectionDef(d, ADOPCION_SECTION_COMPONENTS)).filter((s): s is SectionDef => s !== null),
};

/** Config completa de la hoja de ruta (todas las secciones en orden canónico). */
export function landingConfigForHojaDeRuta(): LandingConfig {
  return HOJA_DE_RUTA_LANDING_CONFIG;
}
