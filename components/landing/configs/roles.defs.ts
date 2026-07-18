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

type Theme = "dark" | "light" | "soft";
interface SectionMeta {
  eyebrow: string;
  theme: Theme;
  sectionType: string;
  tip: string;
  empty: unknown;
}

/**
 * Presentación por sección. La página es una GUÍA DE TRABAJO, no un curso de 4DX, así que
 * el reparto es: el **título** (`label` en `ROLE_SECTIONS`) está en lenguaje llano y responde
 * lo que la persona se pregunta; el **eyebrow** —chico y en mayúsculas— lleva el término
 * técnico (D1…D4, lead/lag) para que el equipo igual aprenda el vocabulario; y el **tip ⓘ**
 * guarda la teoría, que es el único lugar donde no estorba. Los tips se mantienen a ~2
 * líneas: uno largo desborda el globo fuera de su banda.
 * La WIG va en banda `dark` a propósito: es LA meta, tiene que ser imposible de pasar por alto.
 */
const SECTION_META: Record<RoleSectionKey, SectionMeta> = {
  profile: {
    eyebrow: "El puesto",
    theme: "light",
    sectionType: "role_prose",
    tip: "Para qué existe el rol y qué valor aporta.",
    empty: { md: "" },
  },
  responsibilities: {
    eyebrow: "Qué hace",
    theme: "soft",
    sectionType: "role_cards",
    tip: "El alcance del puesto: de qué responde la persona.",
    empty: { items: [] },
  },
  wig: {
    eyebrow: "D1 · WIG",
    theme: "dark",
    sectionType: "role_wig",
    tip: "D1 — Una sola meta, con línea de llegada: «de X a Y para [fecha]». Si no se logra, lo demás importa poco.",
    empty: { desde: "", hasta: "", fecha: "", contexto: "" },
  },
  leadMeasures: {
    eyebrow: "D2 · Medidas de predicción (lead)",
    theme: "light",
    sectionType: "role_lead",
    tip: "D2 — Lo que sí controlas y que anticipa el resultado: semanal, con número, y que dependa de ti, no de un tercero.",
    empty: { intro: "", items: [] },
  },
  lagMeasures: {
    eyebrow: "D2 · Medidas de arrastre (lag)",
    theme: "soft",
    sectionType: "role_lag",
    tip: "D2 — El resultado. Se lee cuando el trabajo que lo produjo ya pasó: no se empuja directo, solo a través de lo que haces cada semana.",
    empty: { intro: "", items: [] },
  },
  scoreboard: {
    eyebrow: "D3 · El marcador",
    theme: "light",
    sectionType: "role_scoreboard",
    tip: "D3 — El marcador de los jugadores: simple, visible, y en 5 segundos dice si vas ganando. Acá está qué gráfico armar en HubSpot para cada medida.",
    empty: { intro: "", items: [] },
  },
  cadencia: {
    eyebrow: "D4 · La cadencia",
    theme: "soft",
    sectionType: "role_cadence",
    tip: "D4 — La WIG Session semanal (≤20 min, mismo día y hora): rendir cuentas → mirar el marcador → comprometer 1-2 movidas.",
    empty: { intro: "", items: [] },
  },
  successPaths: {
    eyebrow: "Qué te hace crecer",
    theme: "light",
    sectionType: "role_success",
    tip: "Los hábitos que hacen crecer a la persona en el puesto.",
    empty: { items: [] },
  },
  failurePaths: {
    eyebrow: "Señales de alarma",
    theme: "soft",
    sectionType: "role_failure",
    tip: "Comportamientos que estancan o descarrilan el rol.",
    empty: { items: [] },
  },
  maturityPath: {
    eyebrow: "L1 → L5",
    theme: "light",
    sectionType: "role_maturity",
    tip: "La escalera de crecimiento del puesto: de la ejecución asistida al liderazgo estratégico.",
    empty: { intro: "", levels: [] },
  },
  transitionPeriod: {
    eyebrow: "Los primeros meses",
    theme: "soft",
    sectionType: "role_prose",
    tip: "Cómo se acompaña a la persona hasta la autonomía.",
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
