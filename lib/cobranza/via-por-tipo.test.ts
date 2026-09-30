/**
 * lib/cobranza/via-por-tipo.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/via-por-tipo.test.ts --project unit`.
 *
 * La clasificación de la cuenta propone por dónde factura (revisión con Alex, 2026-09-29). Hasta ese día toda cuenta
 * nueva nacía con vía Odoo: 16 internacionales quedaron esperando en «Emparejar» un cliente de Odoo que no existe.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COBRANZA_TIPOS_CUENTA, COBRANZA_VIAS_COBRO, crearEmpresaSchema, cuentaCreateSchema } from "./schema";
import { VIA_POR_TIPO, viaDeLaCuentaNueva, viaSegunTipo } from "./via-por-tipo";
import { quedaPorEmparejar } from "./odoo/emparejado";

describe("la clasificación de la cuenta propone la vía de cobro", () => {
  it("nacional factura por Odoo; internacional, por Mercury", () => {
    expect(viaSegunTipo("NACIONAL")).toBe("ODOO");
    expect(viaSegunTipo("INTERNACIONAL")).toBe("MERCURY");
  });

  it("cada tipo de cuenta tiene su vía, y es una vía que existe", () => {
    /* La edición que lo pone en rojo: agregar un tipo de cuenta sin decir por dónde factura. Caería en Odoo sin que
       nadie lo decida. */
    for (const tipo of COBRANZA_TIPOS_CUENTA) {
      expect(VIA_POR_TIPO[tipo], tipo).toBeDefined();
      expect(COBRANZA_VIAS_COBRO).toContain(VIA_POR_TIPO[tipo]);
    }
  });

  it("sin tipo, o con uno que no se conoce, cae en Odoo: el valor que tiene la base", () => {
    expect(viaSegunTipo(null)).toBe("ODOO");
    expect(viaSegunTipo(undefined)).toBe("ODOO");
    expect(viaSegunTipo("REGIONAL")).toBe("ODOO");
  });

  it("⛔ la propuesta nunca pisa lo que eligió la persona", () => {
    /* La puerta que no se cierra: una internacional puede facturar por Odoo, y una nacional por Mercury (DISTELSA). */
    expect(viaDeLaCuentaNueva("INTERNACIONAL", "ODOO")).toBe("ODOO");
    expect(viaDeLaCuentaNueva("NACIONAL", "MERCURY")).toBe("MERCURY");
    expect(viaDeLaCuentaNueva("NACIONAL", "OTRA")).toBe("OTRA");
    expect(viaDeLaCuentaNueva("INTERNACIONAL", undefined)).toBe("MERCURY");
    expect(viaDeLaCuentaNueva("INTERNACIONAL", null)).toBe("MERCURY");
    expect(viaDeLaCuentaNueva("NACIONAL", undefined)).toBe("ODOO");
  });

  it("⭐ una internacional nueva no queda esperando en «Emparejar»; una nacional sí, hasta tener su cliente de Odoo", () => {
    const sinVinculos = new Set<string>();
    expect(quedaPorEmparejar({ id: "a", viaCobro: viaDeLaCuentaNueva("INTERNACIONAL", undefined) }, sinVinculos)).toBe(false);
    expect(quedaPorEmparejar({ id: "b", viaCobro: viaDeLaCuentaNueva("NACIONAL", undefined) }, sinVinculos)).toBe(true);
    /* Y el día que la internacional pase a Odoo, vuelve sola a la lista: la regla mira la vía, no el tipo. */
    expect(quedaPorEmparejar({ id: "a", viaCobro: "ODOO" }, sinVinculos)).toBe(true);
  });
});

describe("⚠ ninguna puerta de alta vuelve a fijar «Odoo» sin mirar el tipo", () => {
  /* Las tres puertas por las que nace una cuenta. La edición que lo pone en rojo: devolverle a un esquema su
     `.default("ODOO")`, o a una de las escrituras su `?? "ODOO"`. La vía de la internacional volvería a nacer en Odoo
     en silencio. */
  it("los dos esquemas de alta dejan la vía sin decidir cuando no viene", () => {
    expect(crearEmpresaSchema.parse({ nombre: "Empresa de prueba", tipo: "INTERNACIONAL" }).viaCobro).toBeUndefined();
    expect(cuentaCreateSchema.parse({ clientId: "cmabc" }).viaCobro).toBeUndefined();
    /* Y si viene, se respeta. */
    expect(crearEmpresaSchema.parse({ nombre: "Empresa de prueba", tipo: "INTERNACIONAL", viaCobro: "ODOO" }).viaCobro).toBe("ODOO");
  });

  it("las dos escrituras que crean la cuenta piden la vía a `viaDeLaCuentaNueva`", () => {
    const leer = (rel: string) => readFileSync(join(__dirname, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const archivo of ["ingest.ts", "mutations.ts"]) {
      const src = leer(archivo);
      expect(src, `${archivo} no deriva la vía del tipo`).toMatch(/viaCobro:\s*viaDeLaCuentaNueva\(/);
      expect(src, `${archivo} volvió a fijar Odoo`).not.toMatch(/viaCobro:[^,\n]*\?\?\s*"ODOO"/);
    }
  });
});
