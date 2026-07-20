/**
 * components/landing/configs/templates.defs.ts
 *
 * REGISTRY de templates de Business Case — metadatos server-safe (sin React).
 * La COMPOSICIÓN de cada template (qué secciones, orden, schemas, briefs) vive en
 * código TS deliberadamente: versionable en git, cero riesgo dual-PC (una tabla de
 * templates en DB podría volar con un `db push` ajeno), y los schemas están
 * acoplados a los componentes de todos modos. Lo editable sin deploy ya existe por
 * BC: briefs/títulos/eyebrows/hidden (Plantilla v0 + overrides).
 *
 * Toda resolución pasa por templateById()/landingConfigFor() — si algún día se
 * quiere una capa de override en DB, se inyecta acá sin tocar call sites.
 *
 * Versionado: el id lleva la versión ("hubspot_v1"). Ediciones aditivas mutan en el
 * lugar; cambios breaking (quitar/renombrar sección, schema incompatible) = id nuevo.
 */
import type { BCSectionDef } from "./business-case.defs";
import { BC_SECTION_DEFS } from "./business-case.defs";
import { makeDiagramArchitectureDef, makeProcessMappingDef, USE_CASES_DEF } from "./shared-sections.defs";
import { WEBSITE_SECTION_DEFS } from "./website.defs";
import { HUBSPOT_TEMPLATE_ID, WEBSITE_TEMPLATE_ID } from "@/lib/business-cases/case-types";

export interface BcTemplateDef {
  id: string;
  /** Rótulo del canvas versionado de cara al CSE (v0 = "Plantilla"; v1+ = `${caseLabel} N`). */
  caseLabel: string;
  /** Intro del system prompt del agente para este template (ausente = la de hubspot). */
  agentIntro?: string;
  /** max_tokens de la generación completa (ausente = 8000). */
  maxTokens?: number;
  /** false = generador TÉCNICO (p.ej. desarrollo): sin las reglas de voz de marca
   *  comercial (metáfora eléctrica, CTA-pregunta). Default true. */
  brandVoice?: boolean;
  features?: {
    /** El checklist de casos de uso aplica a este template (default true). */
    useCaseChecklist?: boolean;
  };
  sections: BCSectionDef[];
}

export const BC_TEMPLATES: Record<string, BcTemplateDef> = {
  [HUBSPOT_TEMPLATE_ID]: {
    id: HUBSPOT_TEMPLATE_ID,
    caseLabel: "Caso de uso",
    // Antes 8000 para 9 secciones; con las 2 nuevas (array-heavy) el tope quedaba
    // corto → riesgo de truncado (JSON inválido → caso vacío). Ver guard en canvas-agent.
    maxTokens: 12000,
    // 9 históricas + `casos_de_uso` (determinística: la llena el checklist del
    // catálogo, vacía = invisible) + 2 nuevas que NACEN OCULTAS (defaultHidden →
    // hidden:true en el Json del canvas al crear): el cliente no ve nada nuevo por
    // default. Canvases viejos (9) no cambian — adoptan la composición al regenerar.
    sections: [
      ...BC_SECTION_DEFS.slice(0, 4), // hero · dolores · antes_despues · solucion
      USE_CASES_DEF,
      ...BC_SECTION_DEFS.slice(4), // roi · cronograma · inversion · partner · cta
      // Motor de diagramas interactivo (la data vieja de tech_architecture se
      // convierte lazy en el renderer — sin migración de DB).
      makeDiagramArchitectureDef({
        key: "arquitectura_tecnologica",
        canvasLabel: "Arquitectura tecnológica",
        label: "Arquitectura tecnológica",
        defaultHidden: true,
      }),
      makeProcessMappingDef({
        key: "mapeo_procesos",
        canvasLabel: "Mapeo de procesos",
        label: "Mapeo de procesos",
        defaultHidden: true,
      }),
    ],
  },
  [WEBSITE_TEMPLATE_ID]: {
    id: WEBSITE_TEMPLATE_ID,
    caseLabel: "Propuesta",
    agentIntro:
      "Sos un consultor de Smarteam (Elite HubSpot Partner · Partner de Insider, LATAM) que arma una PROPUESTA DE SITIO WEB (diseño + desarrollo, típicamente sobre HubSpot Content Hub) para un prospecto, a partir de transcripts de reuniones comerciales y notas. Posicionamiento de la marca: Smarteam no vende software — lo pone a producir.\n\nESTA PROPUESTA SE PRESENTA EN PANTALLA, EN VIVO: escribí en estilo ejecutivo y ESCUETO. Frases cortas; NINGÚN campo de texto de más de 2 líneas (~25 palabras); títulos de 3 a 6 palabras; detalles de UNA línea. Preferí sustantivos concretos sobre narrativa. Menos es más: si dudás entre incluir o recortar, recortá.",
    maxTokens: 12000, // 8 secciones más ricas que las del BC clásico
    features: { useCaseChecklist: false }, // sin sección de materialización en las 8 (F7)
    sections: WEBSITE_SECTION_DEFS,
  },
};

/** Template por id, con fallback al de HubSpot (null/desconocido = comportamiento legacy). */
export function templateById(id?: string | null): BcTemplateDef {
  return (id && BC_TEMPLATES[id]) || BC_TEMPLATES[HUBSPOT_TEMPLATE_ID];
}

/** Lookup key → def dentro de un template (con el mismo fallback). */
export function templateDefsByKey(id?: string | null): Record<string, BCSectionDef> {
  return Object.fromEntries(templateById(id).sections.map((d) => [d.key, d]));
}

/** Busca una def por key EN CUALQUIER template (fallback legacy de regenerateSectionData:
 *  un bloque de un canvas viejo cuyo template ya no la define no debe perder su data). */
export function findDefAcrossTemplates(sectionKey: string): BCSectionDef | undefined {
  for (const tpl of Object.values(BC_TEMPLATES)) {
    const def = tpl.sections.find((d) => d.key === sectionKey);
    if (def) return def;
  }
  return undefined;
}
