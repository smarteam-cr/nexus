/**
 * lib/cobranza/odoo/guardas.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/odoo --project unit`.
 *
 * Guardas de ARMADO: no prueban qué calcula el espejo, prueban que siga siendo la clase de
 * módulo que se decidió que fuera. Son las que se rompen dentro de seis meses, cuando alguien
 * necesite un campo más y llame al ERP desde el motor.
 *
 * ⚠ Todas leen el fuente con los COMENTARIOS QUITADOS. Sin eso una guarda se cumple a sí
 * misma con el párrafo que explica por qué existe — ya pasó una vez en este repo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = __dirname;

/** Quita bloques `/* … *​/` y líneas `//` para que ninguna guarda matchee su propia prosa. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const archivos = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const fuente = (f: string) => sinComentarios(readFileSync(join(DIR, f), "utf8"));

describe("el espejo no convierte moneda", () => {
  it("⛔ ningún archivo del espejo importa el motor de equilibrio ni nombra el tipo de cambio", () => {
    /* `convertir()` de lib/finanzas/equilibrio.ts es el ÚNICO punto de conversión del
       sistema, y el test §K de equilibrio.test.ts ya lo custodia para los otros motores.
       El espejo guarda el monto en la moneda nativa del documento: cuando el cobro y la
       factura no coinciden se MARCAN las dos cifras, nunca se cuadran. */
    for (const f of archivos) {
      const src = fuente(f);
      expect(src, `${f} importa el motor de equilibrio`).not.toMatch(/from\s+["'].*finanzas\/equilibrio/);
      expect(src, `${f} nombra el tipo de cambio`).not.toMatch(/crcPorUsd|TipoCambioMes/);
    }
  });
});

describe("el transporte queda detrás de su interfaz", () => {
  it("⛔ solo transporte-xmlrpc.ts habla HTTP", () => {
    /* El protocolo se eligió por un PERMISO del ERP, no por gusto, y ese permiso puede
       cambiar sin avisarnos. Si el motor llama a Odoo por su cuenta, cambiar de transporte
       deja de ser escribir otra implementación. */
    for (const f of archivos) {
      if (f === "transporte-xmlrpc.ts") continue;
      expect(fuente(f), `${f} habla HTTP directo`).not.toMatch(/node:https|node:http\b|\bfetch\s*\(/);
    }
  });

  it("el puerto no sabe de HTTP en absoluto", () => {
    expect(fuente("transporte.ts")).not.toMatch(/https?:\/\/|xmlrpc|jsonrpc/i);
  });
});

describe("el espejo es un módulo puro", () => {
  it("⛔ no importa Prisma ni la base", () => {
    /* El proyecto `unit` de vitest corre sin servicios. Un import de Prisma acá no rompe el
       build: rompe la posibilidad de tener tests. */
    for (const f of archivos) {
      expect(fuente(f), `${f} importa la base`).not.toMatch(/@prisma\/client|from\s+["']@\/lib\/db/);
    }
  });

  it("⛔ espejo.ts no lee el reloj", () => {
    /* Una decisión que consulta `new Date()` no se puede probar contra una fecha fija: el
       test pasa hoy y falla el primero del mes. Las fechas entran como argumento. */
    expect(fuente("espejo.ts")).not.toMatch(/new Date\(\s*\)|Date\.now\(/);
  });
});

describe("ningún cobro se marca cobrado por el sync (INV25)", () => {
  it("⛔ el espejo no escribe confirmadoPor", () => {
    /* `COBRADO` exige `confirmadoPor` de una persona (INV3). El espejo PROPONE; confirmar la
       plata sigue siendo de alguien con nombre. */
    for (const f of archivos) {
      expect(fuente(f), `${f} escribe confirmadoPor`).not.toMatch(/confirmadoPor\s*[:=]/);
    }
  });
});
