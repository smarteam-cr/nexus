/**
 * lib/auth/permissions/schema.test.ts
 *
 * Validación en la frontera:
 *   A) Escritura (zod estricto): acepta sparse válido; rechaza sección/acción
 *      desconocida, valor no-boolean y v !== 1.
 *   B) Lectura tolerante (parsePermissionMapLoose): basura → null; celdas
 *      desconocidas se descartan; booleanos conocidos sobreviven; v!==1 → null;
 *      {v:1} sin sections → mapa vacío (hereda todo), no null.
 *
 * Correr: `npx vitest run lib/auth/permissions/schema.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import { permissionMapWriteSchema, parsePermissionMapLoose } from "./schema";

test("A — escritura estricta contra el registry", () => {
  // sparse válido
  expect(
    permissionMapWriteSchema.safeParse({
      v: 1,
      sections: { cronograma: { regenerate: true }, equipo: {} },
    }).success,
  ).toBe(true);
  // sección desconocida
  expect(
    permissionMapWriteSchema.safeParse({ v: 1, sections: { finanzas: { read: true } } }).success,
  ).toBe(false);
  // acción desconocida dentro de sección real
  expect(
    permissionMapWriteSchema.safeParse({ v: 1, sections: { equipo: { destruir: true } } }).success,
  ).toBe(false);
  // valor no boolean
  expect(
    permissionMapWriteSchema.safeParse({ v: 1, sections: { equipo: { manage: "sí" } } }).success,
  ).toBe(false);
  // versión desconocida
  expect(
    permissionMapWriteSchema.safeParse({ v: 2, sections: {} }).success,
  ).toBe(false);
});

test("B — lectura tolerante", () => {
  // basura → null (cae a la capa anterior, nunca 500)
  expect(parsePermissionMapLoose(null)).toBeNull();
  expect(parsePermissionMapLoose("x")).toBeNull();
  expect(parsePermissionMapLoose([1, 2])).toBeNull();
  expect(parsePermissionMapLoose({ v: 2, sections: {} })).toBeNull();

  // celdas desconocidas se descartan, conocidas sobreviven
  const parsed = parsePermissionMapLoose({
    v: 1,
    sections: {
      cronograma: { regenerate: true, inventada: true, write: "no-bool" },
      seccionFutura: { read: true },
    },
  });
  expect(parsed).toEqual({ v: 1, sections: { cronograma: { regenerate: true } } });

  // {v:1} sin sections → mapa vacío (hereda todo), NO null
  expect(parsePermissionMapLoose({ v: 1 })).toEqual({ v: 1, sections: {} });
});
