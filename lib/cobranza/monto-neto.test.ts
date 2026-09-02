/**
 * lib/cobranza/monto-neto.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/monto-neto.test.ts --project unit`.
 *
 * ── EL DEFECTO QUE ESTA GUARDA EXISTE PARA QUE NO VUELVA ────────────────────────
 * **Todo monto de cobranza en Nexus es NETO, y hasta ahora nada lo decía.**
 *
 * La hoja de origen («Facturaciones 2026») lleva una columna de IVA al 13 % por quincena, y
 * el importador la descartó a propósito. Medido el 2026-09-02: 12 de 13 clientes coinciden
 * con la columna de quincena y NO con quincena × 1,13 — Selvatura 2.000, Global Supply 1.867,
 * Cicadex 1.366,66.
 *
 * ⚠ Pero la factura que el cliente recibe **sí** puede llevar el impuesto: de las 111
 * facturas de 2026 en Odoo, **100 lo llevan**. El borrador de cobro decía «el monto pendiente
 * es de $2.000» y al cliente le llegaba una factura de $2.260 — y el modelo no tenía cómo
 * saberlo: su prompt son 1.704 caracteres sin una sola mención del impuesto.
 *
 * ⚠⚠ Y NO se puede resolver escribiendo «+13 %»: hay 11 facturas exentas, **todas de
 * empresas costarricenses**. La exención no sigue la línea nacional/internacional, así que
 * ninguna regla por país es correcta. Lo único honesto es no presentar el número como total.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENTE = readFileSync(join(__dirname, "agents", "borrador-cobro.ts"), "utf8");

describe("el borrador que se le manda al cliente", () => {
  it("⚠ le dice al modelo que el monto es del SERVICIO y no lleva impuestos", () => {
    /* Sin esta línea el modelo redacta «el monto pendiente es de $X» sobre un neto, y el
       cliente compara contra una factura que trae el 13 % encima. */
    expect(AGENTE).toMatch(/sin impuestos/i);
    expect(AGENTE, "el rótulo del monto volvió a ser neutro").toContain("Monto del servicio:");
  });

  it("⛔ y le prohíbe presentarlo como el total a pagar", () => {
    expect(AGENTE).toMatch(/NO lo presentes como/);
  });

  it("⛔ NUNCA le dice al modelo que sume un porcentaje", () => {
    /* Es el arreglo tentador y equivocado: 11 de las 111 facturas de 2026 están exentas, y
       las once son de empresas costarricenses. Cualquier «+13 %» hardcodeado le miente a esos
       clientes, y una regla por país tampoco funciona porque la exención no va por ahí.
       El único que sabe si esa factura lleva impuesto es Odoo. */
    const codigo = AGENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/\*\s*1\.13|13\s*%|0\.13/);
  });
});
