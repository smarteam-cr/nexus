/**
 * lib/roles/roles.test.ts — validación de los schemas Zod + la plantilla de secciones.
 * Correr: `npx vitest run lib/roles/roles.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import { roleCreateSchema, rolePatchSchema, ROLE_SECTIONS } from "./schema";
import { ROLE_SECTION_DEFS, ROLE_CONTENT_KEYS, rolesAssistContract } from "@/components/landing/configs/roles.defs";
import { ROLES_SECTION_COMPONENTS } from "@/components/landing/configs/roles";

test("roleCreateSchema: title requerido; area/summary/content opcionales", () => {
  expect(roleCreateSchema.safeParse({ title: "" }).success).toBe(false);
  expect(roleCreateSchema.safeParse({}).success).toBe(false); // sin title

  expect(roleCreateSchema.safeParse({ title: "CSE" }).success).toBe(true);

  const completo = roleCreateSchema.safeParse({
    title: "Asistente de Finanzas",
    area: "Administración",
    summary: "Mantiene la cobranza al día.",
    content: { profile: { md: "**Perfil**" }, responsibilities: { items: [{ title: "Cobrar", detail: "" }] } },
  });
  expect(completo.success).toBe(true);
});

test("rolePatchSchema: parcial + active/order; order negativo falla", () => {
  expect(rolePatchSchema.safeParse({}).success).toBe(true);
  expect(rolePatchSchema.safeParse({ active: false, order: 3 }).success).toBe(true);
  expect(rolePatchSchema.safeParse({ content: { kpis: { items: [] } } }).success).toBe(true);
  expect(rolePatchSchema.safeParse({ order: -1 }).success).toBe(false);
});

test("ROLE_SECTIONS: las 11 secciones de la plantilla, en orden", () => {
  expect(ROLE_SECTIONS.map((s) => s.key)).toEqual([
    "profile",
    "responsibilities",
    // 4DX: WIG (D1) → predicción (D2) → arrastre (D2) → marcador (D3) → cadencia (D4)
    "wig",
    "leadMeasures",
    "lagMeasures",
    "scoreboard",
    "cadencia",
    "successPaths",
    "failurePaths",
    "maturityPath",
    "transitionPeriod",
  ]);
});

test("4DX: la meta manda, y lo que HAGO va antes que el resultado", () => {
  const keys = ROLE_SECTIONS.map((s) => s.key) as string[];
  // La WIG (D1) va antes que cualquier medida.
  expect(keys.indexOf("wig")).toBeLessThan(keys.indexOf("leadMeasures"));
  // La acción semanal (predicción) va ANTES que el resultado (arrastre): lo primero que
  // alguien necesita al abrir su rol es qué hacer, no a dónde tiene que llegar.
  expect(keys.indexOf("leadMeasures")).toBeLessThan(keys.indexOf("lagMeasures"));
  // El marcador (D3) y la cadencia (D4) cierran el bloque, en ese orden.
  expect(keys.indexOf("scoreboard")).toBeLessThan(keys.indexOf("cadencia"));
  expect(keys.indexOf("cadencia")).toBeLessThan(keys.indexOf("successPaths"));
  // Ni la sección única de KPIs ni la de teoría 4DX viven en la página del puesto.
  expect(keys).not.toContain("kpis");
  expect(keys).not.toContain("metodologia");
});

test("ROLE_SECTION_DEFS: hero + las de contenido, con sectionType y sin agente", () => {
  // Hero primero (pinned, selfTitled, alimentado por metadatos).
  const hero = ROLE_SECTION_DEFS[0];
  expect(hero.key).toBe("hero");
  expect(hero.pinned).toBe(true);
  expect(hero.selfTitled).toBe(true);
  expect(hero.sectionType).toBe("role_hero");

  // Las de contenido matchean ROLE_SECTIONS en orden, cada una con renderer + tip.
  const contentDefs = ROLE_SECTION_DEFS.slice(1);
  expect(contentDefs.map((d) => d.key)).toEqual(ROLE_CONTENT_KEYS);
  for (const d of contentDefs) {
    expect(typeof d.sectionType).toBe("string");
    expect((d.tip ?? "").length).toBeGreaterThan(0);
    expect(d.agentGenerated).toBe(false);
    expect(d.pinned).toBeFalsy(); // se omite en lectura si está vacía
  }
});

test("cada sectionType tiene un componente registrado (toSectionDef los DROPEA en silencio)", () => {
  // `toSectionDef` devuelve null —y la sección desaparece sin romper nada— si el
  // sectionType no está en el registry. Un typo se iría a producción con la suite verde.
  const faltantes = ROLE_SECTION_DEFS.filter((d) => !ROLES_SECTION_COMPONENTS[d.sectionType ?? d.key]);
  expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
});

test("no hay componentes huérfanos en el registry", () => {
  const usados = new Set(ROLE_SECTION_DEFS.map((d) => d.sectionType ?? d.key));
  const huerfanos = Object.keys(ROLES_SECTION_COMPONENTS).filter((t) => !usados.has(t));
  expect(huerfanos).toEqual([]);
});

// ── Contrato del ASSIST de documento (ola A3) ────────────────────────────────
// El assist coacciona la propuesta de la IA con el `schema` de cada def
// (coerceToSchema deja SOLO las keys del schema). Un schema vacío o incompleto
// VACIARÍA la sección en silencio al aplicar — este test lo hace imposible:
// las properties del schema cubren TODAS las keys del `empty` de la def.

test("assist: toda def (hero incluido) tiene schema cuyas properties ⊇ keys del empty", () => {
  for (const d of ROLE_SECTION_DEFS) {
    const props = (d.schema as { properties?: Record<string, unknown> })?.properties ?? {};
    const propKeys = new Set(Object.keys(props));
    expect(propKeys.size, `schema vacío en "${d.key}"`).toBeGreaterThan(0);
    for (const emptyKey of Object.keys((d.empty ?? {}) as Record<string, unknown>)) {
      expect(propKeys.has(emptyKey), `"${d.key}": la key "${emptyKey}" del empty falta en el schema`).toBe(true);
    }
  }
});

test("rolesAssistContract: hero + las 11 secciones, con brief y currentData con fallback a empty", () => {
  const contract = rolesAssistContract({
    title: "CSE",
    area: "Customer Success",
    summary: "Acompaña la implementación.",
    content: { profile: { md: "**Perfil**" } }, // el resto vacío → cae al empty
  });
  expect(contract.map((s) => s.key)).toEqual(["hero", ...ROLE_CONTENT_KEYS]);
  for (const s of contract) {
    expect((s.brief ?? "").length, `brief vacío en "${s.key}"`).toBeGreaterThan(0);
    expect(s.currentData, `currentData undefined en "${s.key}"`).toBeDefined();
  }
  expect(contract[0].currentData).toEqual({ title: "CSE", area: "Customer Success", summary: "Acompaña la implementación." });
  expect(contract.find((s) => s.key === "profile")?.currentData).toEqual({ md: "**Perfil**" });
  expect(contract.find((s) => s.key === "wig")?.currentData).toEqual({ desde: "", hasta: "", fecha: "", contexto: "" });
});
