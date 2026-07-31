/**
 * components/landing/configs/propuesta.defs.ts — defs server-safe de una
 * PROPUESTA de contratación.
 *
 * POR QUÉ EXISTE (y por qué NO es un rol con secciones apagadas): el perfil de
 * puesto se le muestra a alguien que YA está en el equipo; la propuesta se le
 * muestra a alguien que está decidiendo si entra. Cambia qué se cuenta (sobra el
 * marcador de HubSpot y la ruta de madurez, falta la oferta económica) y cómo se
 * titula (no hay "yo": no es "la meta que persigo", es "la meta"). El motor de
 * `RoleWorkspace` arma sus secciones desde ROLE_CONTENT_KEYS COMPLETO, así que
 * una sección sin contenido igual pinta su encabezado — quitarlas exigía una
 * lista propia, no un dato vacío.
 *
 * REUSA los componentes de `sections-roles.tsx`: lo único propio es la oferta.
 *
 * STORAGE: comparte tabla con los perfiles de puesto (`RoleProfile`, discriminada por
 * `docType`). Nació hardcodeada para verla rápido; desde el 2026-07-30 es una fila más y
 * se edita in-situ, se comparte y se publica como cualquier documento de /roles.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { RoleSectionKey } from "@/lib/roles/schema";
import { SECTION_META } from "./roles.defs";

const NO_AGENT = { agentGenerated: false, agentHint: "", brief: "" } as const;

/**
 * Las secciones de la propuesta, EN ORDEN. `key` apunta al contenido; `label` es
 * el título que se lee. Donde el rótulo cambia respecto del perfil de puesto, va
 * el motivo al lado.
 */
export const PROPUESTA_SECTIONS = [
  // Va PRIMERO: quien lee todavía no trabaja acá — antes del puesto necesita
  // saber a qué empresa entraría.
  { key: "smarteam", label: "Cómo es Smarteam" },
  { key: "profile", label: "Perfil de puesto" },
  { key: "responsibilities", label: "Responsabilidades" },
  // Alianzas y contratos: es trabajo del puesto, pero de otra naturaleza que la
  // gestión de la cartera — por eso va en su propia sección y no mezclado.
  { key: "partnerships", label: "Responsabilidades de partnerships" },
  // Sin "que persigo": en una propuesta el lector todavía no es el dueño de la meta.
  { key: "wig", label: "La meta" },
  // Ex "Lo que hago cada semana" — misma idea, dicha desde afuera del puesto.
  { key: "leadMeasures", label: "Acciones del puesto" },
  // Ex "Con quién me reúno y de qué". El contenido pasa a frecuencia (sin horas).
  { key: "cadencia", label: "Sesiones de seguimiento" },
  { key: "successPaths", label: "Caminos de éxito" },
  { key: "failurePaths", label: "Caminos de fracaso" },
  { key: "oferta", label: "Propuesta económica" },
] as const;

export type PropuestaSectionKey = (typeof PROPUESTA_SECTIONS)[number]["key"];

/** Quiénes somos: propósito + esqueleto del equipo. No existe en el perfil. */
const SMARTEAM_DEF: BCSectionDef = {
  key: "smarteam",
  label: "Cómo es Smarteam",
  eyebrow: "Dónde entrarías",
  // `soft` y no `light`: el perfil que sigue es `light`, y dos bandas del mismo
  // color seguidas suman sus 48px de padding sin cambio de fondo que los
  // justifique — se lee como un hueco. El resto del documento ya alterna.
  theme: "soft",
  sectionType: "propuesta_smarteam",
  empty: { proposito: "", estructura: [] },
  schema: { type: "object", properties: {} },
  ...NO_AGENT,
};

/**
 * Partnerships: MISMO renderer que Responsabilidades (`role_cards`) — son cards
 * de alcance, solo que de otro dominio. Reusar el tipo evita un componente
 * gemelo que después habría que mantener dos veces.
 */
const PARTNERSHIPS_DEF: BCSectionDef = {
  key: "partnerships",
  label: "Responsabilidades de partnerships",
  eyebrow: "Alianzas y licencias",
  theme: "light",
  sectionType: "role_cards",
  empty: { items: [] },
  schema: { type: "object", properties: {} },
  ...NO_AGENT,
};

/** Def de la única sección que no existe en el perfil de puesto. */
const OFERTA_DEF: BCSectionDef = {
  key: "oferta",
  label: "Propuesta económica",
  eyebrow: "La oferta",
  theme: "light",
  sectionType: "propuesta_oferta",
  empty: { tituloTabla: "", encabezados: { concepto: "", quincenal: "", mensual: "" }, filas: [] },
  schema: { type: "object", properties: {} },
  ...NO_AGENT,
};

/**
 * Las 3 secciones PROPIAS de la propuesta. El resto se hereda de `SECTION_META` (roles).
 *
 * El par de tipos de abajo es un GUARD DE COMPILACIÓN, no decoración: antes esto era
 * `SECTION_META[s.key as keyof typeof SECTION_META]` y el `as` mataba al compilador — si
 * mañana se saca una sección de `ROLE_SECTIONS`, ese código compilaba igual y reventaba con
 * un TypeError al importar, tumbando toda página que muestre una propuesta. Ahora, una key
 * heredada que no exista en la plantilla de roles NO COMPILA.
 */
const PROPIAS = {
  smarteam: SMARTEAM_DEF,
  partnerships: PARTNERSHIPS_DEF,
  oferta: OFERTA_DEF,
} as const;
type PropiaKey = keyof typeof PROPIAS;
type KeyHeredada = Exclude<PropuestaSectionKey, PropiaKey>;
const _heredadasExistenEnRoles: RoleSectionKey = null as unknown as KeyHeredada;
void _heredadasExistenEnRoles;

const HERO_SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, area: { type: "string" }, summary: { type: "string" } },
} as const;

export const PROPUESTA_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "hero",
    label: "Propuesta",
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
  ...PROPUESTA_SECTIONS.map((s): BCSectionDef => {
    const propia = PROPIAS[s.key as PropiaKey];
    if (propia) return propia;
    // El resto hereda del perfil de puesto TODO salvo el título: mismo tipo de
    // sección, mismo shape, mismo tema. Si mañana cambia un renderer de roles,
    // la propuesta lo hereda sola.
    const m = SECTION_META[s.key as KeyHeredada];
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

/** Keys de CONTENIDO (sin el hero, que son metadatos). */
export const PROPUESTA_CONTENT_KEYS = PROPUESTA_SECTIONS.map((s) => s.key);
