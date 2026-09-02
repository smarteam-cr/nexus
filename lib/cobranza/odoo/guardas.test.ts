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

/** Quita bloques de comentario y líneas `//` para que ninguna guarda matchee su propia prosa. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const archivos = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const fuente = (f: string) => sinComentarios(readFileSync(join(DIR, f), "utf8"));

/**
 * Los DOS archivos que tienen permitido tocar el mundo: uno habla HTTP y el otro habla con la
 * base. Todo lo demás decide, y por eso se puede probar.
 *
 * ⚠ La lista se afirma abajo, así que un archivo impuro nuevo no entra sin que alguien lo
 * agregue a mano y explique por qué en el commit.
 */
const IMPUROS = ["servicio.ts", "transporte-xmlrpc.ts"];
const puros = archivos.filter((f) => !IMPUROS.includes(f));

describe("la frontera entre decidir y tocar el mundo", () => {
  it("sigue habiendo exactamente dos archivos impuros", () => {
    expect(archivos.filter((f) => IMPUROS.includes(f)).sort()).toEqual([...IMPUROS].sort());
    expect(puros.length).toBeGreaterThanOrEqual(3);
  });

  it("⛔ solo transporte-xmlrpc.ts habla HTTP", () => {
    /* El protocolo se eligió por un PERMISO del ERP —REST devuelve 403 en los nueve modelos—
       y ese permiso puede cambiar sin avisarnos. Si el motor llama a Odoo por su cuenta,
       cambiar de transporte deja de ser escribir otra implementación. */
    for (const f of archivos) {
      if (f === "transporte-xmlrpc.ts") continue;
      expect(fuente(f), `${f} habla HTTP directo`).not.toMatch(/node:https|node:http\b|\bfetch\s*\(/);
    }
  });

  it("⛔ solo servicio.ts toca la base", () => {
    for (const f of archivos) {
      if (f === "servicio.ts") continue;
      expect(fuente(f), `${f} importa la base`).not.toMatch(/@prisma\/client|from\s+["']@\/lib\/db/);
    }
  });

  it("el puerto no sabe de HTTP en absoluto", () => {
    expect(fuente("transporte.ts")).not.toMatch(/https?:\/\/|xmlrpc|jsonrpc/i);
  });

  it("⛔ ningún módulo puro lee el reloj", () => {
    /* Una decisión que consulta `new Date()` no se puede probar contra una fecha fija: el
       test pasa hoy y falla el primero del mes. Las fechas entran como argumento. */
    for (const f of puros) {
      expect(fuente(f), `${f} lee el reloj`).not.toMatch(/new Date\(\s*\)|Date\.now\(/);
    }
  });
});

describe("el espejo no convierte moneda", () => {
  it("⛔ ningún archivo importa el motor de equilibrio ni nombra el tipo de cambio", () => {
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

describe("ningún cobro se toca desde acá (INV25)", () => {
  it("⛔ nada del módulo escribe en la tabla Cobro", () => {
    /* `COBRADO` exige `confirmadoPor` de una persona (INV3). El espejo PROPONE; confirmar la
       plata sigue siendo de alguien con nombre, por el chokepoint `cambiarEstadoCobro`.

       ⚠ Se busca la ESCRITURA y no la palabra `confirmadoPor`: el vínculo de emparejado
       tiene su propio `confirmadoPor` —quién dijo que este partner es esta cuenta—, que es
       otra cosa y sí se escribe acá. Una guarda por la palabra suelta habría prohibido lo
       que no era. */
    for (const f of archivos) {
      expect(fuente(f), `${f} escribe en Cobro`).not.toMatch(/prisma\.cobro\.(update|create|upsert|delete)/);
      expect(fuente(f), `${f} escribe en Cobro`).not.toMatch(/tx\.cobro\.(update|create|upsert|delete)/);
    }
  });

  it("⛔ y no importa el chokepoint de estado por la puerta de atrás", () => {
    for (const f of archivos) {
      expect(fuente(f), `${f} importa cambiarEstadoCobro`).not.toMatch(/cambiarEstadoCobro/);
    }
  });
});
