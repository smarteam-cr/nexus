/**
 * lib/cobranza/nombre-de-empresa.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/nombre-de-empresa.test.ts --project unit`.
 *
 * El nombre de una empresa se corrige desde la ficha de su cuenta en Cobranza (revisión con Alex, 2026-09-29).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decidirCambioDeNombre, nombreComparable } from "./nombre-de-empresa";
import { cuentaPatchSchema } from "./schema";

const OTRAS = ["Librería Internacional", "Publimark", "ACCCSA"];

describe("corregir el nombre de una empresa desde la ficha de su cuenta", () => {
  it("un nombre nuevo cambia, y dice cuál era el anterior", () => {
    expect(decidirCambioDeNombre("Kolbi", "kölbi", OTRAS)).toEqual({ tipo: "CAMBIA", anterior: "Kolbi", nombre: "kölbi" });
  });

  it("corregir solo mayúsculas, tildes o espacios de la propia empresa también es un cambio", () => {
    expect(decidirCambioDeNombre("publimark  sa", "Publimark SA", [])).toEqual({ tipo: "CAMBIA", anterior: "publimark  sa", nombre: "Publimark SA" });
    expect(decidirCambioDeNombre("Areya", "Areyá", OTRAS).tipo).toBe("CAMBIA");
  });

  it("los espacios de más se quitan antes de guardar", () => {
    expect(decidirCambioDeNombre("X SA", "  Cemaco   Internacional ", OTRAS)).toEqual({ tipo: "CAMBIA", anterior: "X SA", nombre: "Cemaco Internacional" });
  });

  it("el mismo nombre no escribe nada: guardar la ficha por otra cosa no deja una línea en la bitácora", () => {
    expect(decidirCambioDeNombre("Cemaco Internacional", "Cemaco Internacional", OTRAS)).toEqual({ tipo: "IGUAL" });
    expect(decidirCambioDeNombre("Cemaco Internacional", " Cemaco Internacional  ", OTRAS)).toEqual({ tipo: "IGUAL" });
  });

  it("⛔ no deja dos empresas con el mismo nombre, se escriba como se escriba", () => {
    /* El caso del día: renombrar «Librería Internacional (Desarrollos Culturales Costa Rica)» a «Librería
       Internacional», que ya existe. Son la misma empresa cargada dos veces: se fusionan, no se llaman igual. */
    for (const pedido of ["Librería Internacional", "libreria internacional", "LIBRERÍA  INTERNACIONAL"]) {
      const d = decidirCambioDeNombre("Librería Internacional (Desarrollos Culturales Costa Rica)", pedido, OTRAS);
      expect(d.tipo, pedido).toBe("RECHAZO");
      expect(d.tipo === "RECHAZO" && d.motivo).toContain("«Librería Internacional»");
      expect(d.tipo === "RECHAZO" && d.motivo).toContain("fusionarlas");
    }
  });

  it("un nombre vacío, de una letra o kilométrico se rechaza", () => {
    expect(decidirCambioDeNombre("Cemaco", "   ", OTRAS).tipo).toBe("RECHAZO");
    expect(decidirCambioDeNombre("Cemaco", "C", OTRAS).tipo).toBe("RECHAZO");
    expect(decidirCambioDeNombre("Cemaco", "x".repeat(201), OTRAS).tipo).toBe("RECHAZO");
  });

  it("comparable: sin tildes, sin mayúsculas, sin espacios de más", () => {
    expect(nombreComparable("  LIBRERÍA   Internacional ")).toBe("libreria internacional");
  });
});

describe("⚠ el nombre se cambia por un solo camino, que avisa y anota", () => {
  const leer = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("el esquema de la ficha acepta el nombre, y no lo exige", () => {
    expect(cuentaPatchSchema.parse({ nombre: "  Cemaco Internacional " }).nombre).toBe("Cemaco Internacional");
    expect(cuentaPatchSchema.parse({ correoCobro: null }).nombre).toBeUndefined();
    expect(cuentaPatchSchema.safeParse({ nombre: "C" }).success).toBe(false);
  });

  it("⛔ `nombre` no llega a la escritura de la cuenta: no es una columna suya", () => {
    /* La edición que lo pone en rojo: sacar `nombre` del desarme de `updateCuenta`. Viajaría dentro de `resto` a
       `cuentaFinanciera.update` y Prisma rechazaría el guardado entero con un error que no dice nada. */
    const src = leer("lib/cobranza/mutations.ts");
    expect(src).toMatch(/const \{ viaCobro, nombre, \.\.\.resto \} = data;/);
    expect(src, "el nombre se decide con la regla pura").toMatch(/decidirCambioDeNombre\(/);
  });

  it("cambiar el nombre pide permiso de edición y vuelve a repartir las reuniones", () => {
    /* El nombre decide de qué empresa es una reunión cuando se atribuye por el título: renombrar sin volver a
       repartirlas deja la atribución vieja. Es lo mismo que hace la ficha del cliente (PATCH /api/clients/[id]). */
    const ruta = leer("app/api/cobranza/cuentas/[cuentaId]/route.ts");
    expect(ruta).toMatch(/nombre !== undefined[\s\S]*guardCobranzaEditor\(\)/);
    expect(ruta).toMatch(/resolveAllSessions\(\)/);
    expect(ruta).toMatch(/revalidateClientsSidebar\(\)/);
  });
});
