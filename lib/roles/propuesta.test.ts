/**
 * lib/roles/propuesta.test.ts — congela la PLANTILLA de la propuesta de contratación.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * La propuesta se construyó en producción sin ningún test detrás: `registry.test.ts`
 * cubre BC/kickoff/desarrollo y `roles.test.ts` cubre los perfiles de puesto, pero
 * `PROPUESTA_SECTION_DEFS` no lo tocaba nadie. Y su modo de falla es SILENCIOSO:
 * `toSectionDef` devuelve `null` ante un `sectionType` desconocido y `LandingView` lo
 * filtra sin romper — un typo hace desaparecer una sección, y la que puede desaparecer
 * es la OFERTA ECONÓMICA de un documento que se le manda a una persona candidata.
 *
 * Lo otro que vigila: la propuesta HEREDA 7 de sus secciones de `SECTION_META` (la
 * plantilla de roles). Si alguien cambia un renderer allá, acá se entera.
 */
import { describe, expect, it } from "vitest";
import {
  PROPUESTA_SECTIONS,
  PROPUESTA_SECTION_DEFS,
  PROPUESTA_CONTENT_KEYS,
} from "@/components/landing/configs/propuesta.defs";
import { PROPUESTA_SECTION_COMPONENTS } from "@/components/landing/configs/propuesta";
import { SECTION_META } from "@/components/landing/configs/roles.defs";

/** Las 7 que salen del perfil de puesto: acá solo cambia el título. */
const HEREDADAS = [
  "profile",
  "responsibilities",
  "wig",
  "leadMeasures",
  "cadencia",
  "successPaths",
  "failurePaths",
] as const;

describe("plantilla de la propuesta", () => {
  it("tiene EXACTAMENTE estas secciones, en este orden", () => {
    // Cambiar el set o el orden es una decisión de producto: que rompa el test y se vea.
    expect(PROPUESTA_CONTENT_KEYS).toEqual([
      "smarteam",
      "profile",
      "responsibilities",
      "partnerships",
      "wig",
      "leadMeasures",
      "cadencia",
      "successPaths",
      "failurePaths",
      "oferta",
    ]);
  });

  it("abre con el hero y después van las secciones de contenido", () => {
    const hero = PROPUESTA_SECTION_DEFS[0];
    expect(hero.key).toBe("hero");
    expect(hero.sectionType).toBe("role_hero");
    expect(hero.pinned).toBe(true);
    expect(hero.selfTitled).toBe(true);
    expect(PROPUESTA_SECTION_DEFS.slice(1).map((d) => d.key)).toEqual([...PROPUESTA_CONTENT_KEYS]);
  });

  it("TODA def resuelve un componente (el drop silencioso de toSectionDef)", () => {
    for (const def of PROPUESTA_SECTION_DEFS) {
      expect(
        PROPUESTA_SECTION_COMPONENTS[def.sectionType ?? ""],
        `la sección "${def.key}" apunta a un sectionType sin componente: ${def.sectionType}`,
      ).toBeTruthy();
    }
  });

  it("no hay componentes huérfanos en el registro", () => {
    const usados = new Set(PROPUESTA_SECTION_DEFS.map((d) => d.sectionType ?? ""));
    for (const tipo of Object.keys(PROPUESTA_SECTION_COMPONENTS)) {
      expect(usados.has(tipo), `sectionType registrado y sin usar: ${tipo}`).toBe(true);
    }
  });

  it("las 7 secciones heredadas siguen el shape del perfil de puesto", () => {
    for (const key of HEREDADAS) {
      const def = PROPUESTA_SECTION_DEFS.find((d) => d.key === key);
      const meta = SECTION_META[key];
      expect(def, `falta la sección heredada ${key}`).toBeTruthy();
      // El TÍTULO sí cambia a propósito (la propuesta habla desde afuera del puesto);
      // el tipo de sección, el vacío y el tema NO: se heredan.
      expect(def!.sectionType).toBe(meta.sectionType);
      expect(def!.theme).toBe(meta.theme);
      expect(def!.empty).toEqual(meta.empty);
    }
  });

  it("ninguna sección es generable por agente (la propuesta se cura a mano)", () => {
    // Coherente con el 409 del endpoint de assist: 3 defs propias tienen el schema vacío
    // y `coerceToSchema` las vaciaría al aplicar una propuesta de la IA.
    for (const def of PROPUESTA_SECTION_DEFS) {
      expect(def.agentGenerated, `la sección ${def.key} se declara generable`).toBe(false);
    }
  });

  it("cada sección tiene su título visible", () => {
    for (const s of PROPUESTA_SECTIONS) {
      expect(s.label.trim().length, `la sección ${s.key} no tiene label`).toBeGreaterThan(0);
    }
  });
});
