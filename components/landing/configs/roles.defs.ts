/**
 * components/landing/configs/roles.defs.ts
 *
 * Defs SERVER-SAFE (sin React) de las secciones de un perfil de puesto (Roles), sobre
 * el mismo motor `LandingView` que los business cases y el kickoff. Espeja el patrón de
 * `kickoff.defs.ts`: fuente única de key/label/eyebrow/theme/tip/sectionType/empty, que el
 * registry client (`roles.ts`) ata a los componentes de `sections-roles.tsx`.
 *
 * A diferencia del BC/kickoff, Roles NO usa el motor de DATOS (ProjectCanvas/CanvasBlock)
 * ni IA: el contenido vive como JSON estructurado en `RoleProfile.content` y se llena a
 * mano (agentGenerated:false en todas). El hero (title/area/summary) sale de los
 * metadatos del rol, no de `content`. El reordenamiento de SECCIONES está apagado (el
 * workspace no pasa `onReorder`); se reordenan los ÍTEMS dentro de cada sección. Solo el
 * hero es `pinned` (para que SIEMPRE se renderice); las secciones de contenido NO lo son,
 * así una sección vacía se OMITE en modo lectura (como el RolePage viejo filtraba).
 */
import type { BCSectionDef } from "./business-case.defs";
import { ROLE_SECTIONS, type RoleSectionKey } from "@/lib/roles/schema";

type Theme = "light" | "soft";
interface SectionMeta {
  eyebrow: string;
  theme: Theme;
  sectionType: string;
  tip: string;
  empty: unknown;
}

/** Presentación por sección de contenido (las 7 de ROLE_SECTIONS). */
const SECTION_META: Record<RoleSectionKey, SectionMeta> = {
  profile: {
    eyebrow: "El puesto",
    theme: "light",
    sectionType: "role_prose",
    tip: "La misión del puesto y su encuadre: para qué existe el rol y qué valor aporta.",
    empty: { md: "" },
  },
  responsibilities: {
    eyebrow: "Qué hace",
    theme: "soft",
    sectionType: "role_cards",
    tip: "Las responsabilidades concretas del día a día — lo que la persona hace y de qué responde.",
    empty: { items: [] },
  },
  kpis: {
    eyebrow: "Cómo se mide",
    theme: "light",
    sectionType: "role_kpis",
    tip: "Cómo se mide el desempeño: métricas de PREDICCIÓN (ejecución que controla) y de ARRASTRE (impacto comercial).",
    empty: { intro: "", items: [] },
  },
  successPaths: {
    eyebrow: "Qué lo hace crecer",
    theme: "soft",
    sectionType: "role_success",
    tip: "Los comportamientos y hábitos que hacen crecer a la persona en el puesto.",
    empty: { items: [] },
  },
  failurePaths: {
    eyebrow: "Señales de alarma",
    theme: "light",
    sectionType: "role_failure",
    tip: "Las señales de alarma: comportamientos que estancan o descarrilan el rol.",
    empty: { items: [] },
  },
  maturityPath: {
    eyebrow: "L1 → L5",
    theme: "soft",
    sectionType: "role_maturity",
    tip: "La escalera de crecimiento del puesto (L1 → L5): de la ejecución asistida al liderazgo estratégico.",
    empty: { intro: "", levels: [] },
  },
  transitionPeriod: {
    eyebrow: "Los primeros meses",
    theme: "light",
    sectionType: "role_prose",
    tip: "El plan de los primeros meses: cómo se acompaña a la persona hasta la autonomía.",
    empty: { md: "" },
  },
};

/** Base común: Roles no usa agente (agentGenerated:false, sin schema ni brief). */
const NO_AGENT = { agentGenerated: false, agentHint: "", brief: "", schema: {} } as const;

export const ROLE_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "hero",
    label: "Perfil",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    pinned: true,
    noHide: true,
    sectionType: "role_hero",
    empty: { title: "", area: "", summary: "" },
    ...NO_AGENT,
  },
  ...ROLE_SECTIONS.map((s): BCSectionDef => {
    const m = SECTION_META[s.key];
    return {
      key: s.key,
      label: s.label,
      eyebrow: m.eyebrow,
      tip: m.tip,
      theme: m.theme,
      sectionType: m.sectionType,
      empty: m.empty,
      ...NO_AGENT,
    };
  }),
];

/** Las keys de sección de CONTENIDO que renderiza el motor (sin el hero, que es
 *  metadatos). Útil para armar el mapa `content` → sections del LandingView. */
export const ROLE_CONTENT_KEYS = ROLE_SECTIONS.map((s) => s.key);
