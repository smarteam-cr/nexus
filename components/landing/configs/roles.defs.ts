/**
 * components/landing/configs/roles.defs.ts
 *
 * Defs SERVER-SAFE (sin React) de las secciones de un perfil de puesto (Roles), sobre
 * el mismo motor `LandingView` que los business cases y el kickoff. Espeja el patrón de
 * `kickoff.defs.ts`: fuente única de key/label/eyebrow/theme/tip/sectionType/empty, que el
 * registry client (`roles.ts`) ata a los componentes de `sections-roles.tsx`.
 *
 * A diferencia del BC/kickoff, Roles NO usa el motor de DATOS (ProjectCanvas/CanvasBlock):
 * el contenido vive como JSON estructurado en `RoleProfile.content`, curado a mano —
 * `agentGenerated:false` en todas (sin generación completa ni regen por bloque). La IA
 * participa SOLO vía el assist de documento (propone, el humano aplica); su contrato de
 * shapes sale de estos defs. El hero (title/area/summary) sale de los
 * metadatos del rol, no de `content`. El reordenamiento de SECCIONES está apagado (el
 * workspace no pasa `onReorder`); se reordenan los ÍTEMS dentro de cada sección. Solo el
 * hero es `pinned` (para que SIEMPRE se renderice); las secciones de contenido NO lo son,
 * así una sección vacía se OMITE en modo lectura (como el RolePage viejo filtraba).
 */
import type { BCSectionDef } from "./business-case.defs";
import type { AssistSectionDef } from "@/lib/ai/assist";
import { ROLE_SECTIONS, type RoleSectionKey } from "@/lib/roles/schema";

type Theme = "dark" | "light" | "soft";
interface SectionMeta {
  eyebrow: string;
  theme: Theme;
  sectionType: string;
  tip: string;
  empty: unknown;
  /** Shape para el ASSIST de documento (espejo EXACTO de los interfaces de
   *  sections-roles.tsx — el test de contrato en lib/roles/roles.test.ts lo
   *  congela contra `empty`). NO habilita generación completa ni regen por
   *  bloque: `agentGenerated` sigue en false. */
  schema: Record<string, unknown>;
  /** Guía para el assist (reglas de escritura de ESTA sección — doctrina de
   *  DECISIONS §Roles). El tip ⓘ es para humanos; esto es para el modelo. */
  assistBrief: string;
}

const str = { type: "string" } as const;
const items = (props: Record<string, unknown>) => ({
  type: "array",
  items: { type: "object", properties: props },
});

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
    schema: { type: "object", properties: { md: str } },
    assistBrief: "Para qué existe el rol y qué valor aporta, en 2-4 líneas de markdown simple. Directo, sin teoría.",
  },
  responsibilities: {
    eyebrow: "Qué hace",
    theme: "soft",
    sectionType: "role_cards",
    tip: "El alcance del puesto: de qué responde la persona.",
    empty: { items: [] },
    schema: { type: "object", properties: { items: items({ title: str, detail: str }) } },
    assistBrief:
      "El mapa en trazo grueso del puesto: UNA línea por ítem en `title`, `detail` SIEMPRE vacío (\"\"). El QUÉ HACER vive en las medidas semanales, no acá — no dupliques.",
  },
  wig: {
    eyebrow: "D1 · WIG",
    theme: "dark",
    sectionType: "role_wig",
    tip: "D1 — Una sola meta, con línea de llegada: «de X a Y para [fecha]». Si no se logra, lo demás importa poco.",
    empty: { desde: "", hasta: "", fecha: "", contexto: "" },
    schema: { type: "object", properties: { desde: str, hasta: str, fecha: str, contexto: str } },
    assistBrief:
      "UNA sola meta con línea de llegada: `desde` = X actual, `hasta` = Y objetivo, `fecha` = para cuándo. Los números existentes son ejemplos del liderazgo: consérvalos salvo que la instrucción pida cambiarlos. `contexto` opcional, 1 línea.",
  },
  leadMeasures: {
    eyebrow: "D2 · Medidas de predicción (lead)",
    theme: "light",
    sectionType: "role_lead",
    tip: "D2 — Lo que sí controlas y que anticipa el resultado: semanal, con número, y que dependa de ti, no de un tercero.",
    empty: { intro: "", items: [] },
    schema: { type: "object", properties: { intro: str, items: items({ title: str, detail: str, meta: str }) } },
    assistBrief:
      "5 medidas por puesto, en TRES capas: `title` = de qué se hace cargo la persona (ancho, primera persona implícita), `detail` = la acción concreta en imperativo y tuteo (incluye DÓNDE aterriza el resultado si aplica), `meta` = el número semanal. REGLA DURA: una medida de predicción es un acto HUMANO — si un agente de Nexus lo puede hacer (correr un checklist, publicar un calendario), NO es medida de predicción. Crear/decidir/conversar/validar sí lo son.",
  },
  lagMeasures: {
    eyebrow: "D2 · Medidas de arrastre (lag)",
    theme: "soft",
    sectionType: "role_lag",
    tip: "D2 — El resultado. Se lee cuando el trabajo que lo produjo ya pasó: no se empuja directo, solo a través de lo que haces cada semana.",
    empty: { intro: "", items: [] },
    schema: { type: "object", properties: { intro: str, items: items({ title: str, detail: str, meta: str }) } },
    assistBrief:
      "Los RESULTADOS que las medidas de predicción mueven (lag): `title` = el resultado, `detail` = 1 línea de qué lo mueve, `meta` = el número objetivo. Pocas (2-4).",
  },
  scoreboard: {
    eyebrow: "D3 · El marcador",
    theme: "light",
    sectionType: "role_scoreboard",
    tip: "D3 — El marcador de los jugadores: simple, visible, y en 5 segundos dice si vas ganando. Acá está qué gráfico armar en HubSpot para cada medida.",
    empty: { intro: "", items: [] },
    schema: {
      type: "object",
      properties: { intro: str, items: items({ measure: str, kind: str, chart: str, fuente: str, ganar: str }) },
    },
    assistBrief:
      'APUNTA al gráfico, no lo explica: `measure` = la medida, `kind` = "prediccion" o "arrastre" (SOLO esos dos valores), `chart` = "gauge" | "bar" | "line" | "number" (SOLO esos cuatro), `fuente` = dónde vive en HubSpot en UNA línea (~50 chars, sin receta de armado), `ganar` = cómo se ve ir ganando en 5 segundos. No toda medida necesita gráfico — el criterio humano no se grafica.',
  },
  cadencia: {
    eyebrow: "D4 · La cadencia",
    theme: "soft",
    sectionType: "role_cadence",
    tip: "D4 — La WIG Session semanal (≤20 min, mismo día y hora): rendir cuentas → mirar el marcador → comprometer 1-2 movidas.",
    empty: { intro: "", items: [] },
    schema: { type: "object", properties: { intro: str, items: items({ evento: str, quienes: str, cuando: str, formato: str }) } },
    assistBrief:
      "Con quién se reúne la persona y de qué: `evento`, `quienes`, `cuando` (día/frecuencia), `formato` (1 línea). La WIG Session semanal siempre está.",
  },
  successPaths: {
    eyebrow: "Qué te hace crecer",
    theme: "light",
    sectionType: "role_success",
    tip: "Los hábitos que hacen crecer a la persona en el puesto.",
    empty: { items: [] },
    schema: { type: "object", properties: { items: items({ title: str, detail: str }) } },
    assistBrief: "Hábitos que hacen crecer en el puesto: `title` corto + `detail` de 1-2 líneas, accionable.",
  },
  failurePaths: {
    eyebrow: "Señales de alarma",
    theme: "soft",
    sectionType: "role_failure",
    tip: "Comportamientos que estancan o descarrilan el rol.",
    empty: { items: [] },
    schema: { type: "object", properties: { items: items({ title: str, detail: str }) } },
    assistBrief: "Comportamientos que estancan o descarrilan: `title` corto + `detail` de 1-2 líneas, sin sermón.",
  },
  maturityPath: {
    eyebrow: "L1 → L5",
    theme: "light",
    sectionType: "role_maturity",
    tip: "La escalera de crecimiento del puesto: de la ejecución asistida al liderazgo estratégico.",
    empty: { intro: "", levels: [] },
    schema: {
      type: "object",
      properties: { intro: str, levels: items({ level: str, titulo: str, alcance: str, impacto: str }) },
    },
    assistBrief:
      "La escalera L1→L5 del puesto: `level` (\"L1\"…\"L5\"), `titulo` del nivel, `alcance` (qué hace en ese nivel, 1 línea) e `impacto` (qué cambia para Smarteam, 1 línea).",
  },
  transitionPeriod: {
    eyebrow: "Los primeros meses",
    theme: "soft",
    sectionType: "role_prose",
    tip: "Cómo se acompaña a la persona hasta la autonomía.",
    empty: { md: "" },
    schema: { type: "object", properties: { md: str } },
    assistBrief: "Cómo se acompaña a la persona hasta la autonomía, en markdown simple corto (etapas o bullets).",
  },
};

/** Base común: Roles no usa GENERACIÓN por agente (agentGenerated:false — sin
 *  generación completa ni regen por bloque). El `schema` real de cada def viene
 *  de SECTION_META y alimenta SOLO el assist de documento (propone; el humano
 *  aplica). */
const NO_AGENT = { agentGenerated: false, agentHint: "", brief: "" } as const;

/** Shape del hero para el assist (title/area/summary — el apply lo mapea a los
 *  METADATOS del rol, no a `content`). */
const HERO_SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, area: { type: "string" }, summary: { type: "string" } },
} as const;

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
    schema: HERO_SCHEMA,
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
      schema: m.schema,
      ...NO_AGENT,
    };
  }),
];

/** Las keys de sección de CONTENIDO que renderiza el motor (sin el hero, que es
 *  metadatos). Útil para armar el mapa `content` → sections del LandingView. */
export const ROLE_CONTENT_KEYS = ROLE_SECTIONS.map((s) => s.key);

/**
 * CONTRATO del assist de documento de un rol: hero (pseudo-sección → metadatos)
 * + las 11 secciones, cada una con su shape exacto, su guía de escritura
 * (assistBrief — doctrina de DECISIONS §Roles) y la data actual (o el `empty`
 * si está vacía). Lo consume POST /api/roles/[id]/assist → runDocumentAssist.
 */
export function rolesAssistContract(role: {
  title: string;
  area: string | null;
  summary: string | null;
  content: Record<string, unknown>;
}): AssistSectionDef[] {
  return [
    {
      key: "hero",
      label: "Título, área y resumen",
      schema: HERO_SCHEMA,
      brief:
        "Los metadatos del puesto: `title` = nombre del puesto (corto), `area` = equipo, `summary` = 1 línea de qué logra el puesto (subtítulo del hero). Solo tócalos si la instrucción lo pide.",
      currentData: { title: role.title, area: role.area ?? "", summary: role.summary ?? "" },
    },
    ...ROLE_SECTIONS.map((s) => {
      const m = SECTION_META[s.key];
      return {
        key: s.key,
        label: s.label,
        schema: m.schema,
        brief: m.assistBrief,
        currentData: role.content[s.key] ?? m.empty,
      };
    }),
  ];
}
