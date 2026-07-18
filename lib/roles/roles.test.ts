/**
 * lib/roles/roles.test.ts — validación de los schemas Zod + la plantilla de secciones.
 * Correr: `npx vitest run lib/roles/roles.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import { roleCreateSchema, rolePatchSchema, ROLE_SECTIONS } from "./schema";
import { ROLE_SECTION_DEFS, ROLE_CONTENT_KEYS } from "@/components/landing/configs/roles.defs";

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

test("ROLE_SECTIONS: las 7 secciones de la plantilla, en orden", () => {
  expect(ROLE_SECTIONS.map((s) => s.key)).toEqual([
    "profile",
    "responsibilities",
    "kpis",
    "successPaths",
    "failurePaths",
    "maturityPath",
    "transitionPeriod",
  ]);
});

test("ROLE_SECTION_DEFS: hero + las 7 de contenido, con sectionType y sin agente", () => {
  // Hero primero (pinned, selfTitled, alimentado por metadatos).
  const hero = ROLE_SECTION_DEFS[0];
  expect(hero.key).toBe("hero");
  expect(hero.pinned).toBe(true);
  expect(hero.selfTitled).toBe(true);
  expect(hero.sectionType).toBe("role_hero");

  // Las 7 de contenido matchean ROLE_SECTIONS en orden, cada una con renderer + tip.
  const contentDefs = ROLE_SECTION_DEFS.slice(1);
  expect(contentDefs.map((d) => d.key)).toEqual(ROLE_CONTENT_KEYS);
  for (const d of contentDefs) {
    expect(typeof d.sectionType).toBe("string");
    expect((d.tip ?? "").length).toBeGreaterThan(0);
    expect(d.agentGenerated).toBe(false);
    expect(d.pinned).toBeFalsy(); // se omite en lectura si está vacía
  }
});
