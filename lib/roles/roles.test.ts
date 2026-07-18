/**
 * lib/roles/roles.test.ts — validación de los schemas Zod + la plantilla fija.
 * Correr: `npx vitest run lib/roles/roles.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import { roleCreateSchema, rolePatchSchema, ROLE_SECTIONS } from "./schema";

test("roleCreateSchema: title requerido; secciones markdown opcionales", () => {
  expect(roleCreateSchema.safeParse({ title: "" }).success).toBe(false);
  expect(roleCreateSchema.safeParse({}).success).toBe(false); // sin title

  const minimo = roleCreateSchema.safeParse({ title: "CSE" });
  expect(minimo.success).toBe(true);

  const completo = roleCreateSchema.safeParse({
    title: "Asistente de Finanzas",
    area: "Administración",
    summary: "Mantiene la cobranza al día.",
    profile: "**Perfil** con viñetas\n- una\n- dos",
    responsibilities: "Cobrar",
    kpis: null, // nullish permitido
  });
  expect(completo.success).toBe(true);
});

test("rolePatchSchema: parcial + active/order; order negativo falla", () => {
  expect(rolePatchSchema.safeParse({}).success).toBe(true);
  expect(rolePatchSchema.safeParse({ active: false, order: 3 }).success).toBe(true);
  expect(rolePatchSchema.safeParse({ order: -1 }).success).toBe(false);
});

test("ROLE_SECTIONS: las 6 secciones de la plantilla, en orden", () => {
  expect(ROLE_SECTIONS.map((s) => s.key)).toEqual([
    "profile",
    "responsibilities",
    "kpis",
    "successPaths",
    "failurePaths",
    "maturityPath",
  ]);
});
