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
 * Los CUATRO archivos que tienen permitido tocar el mundo: uno habla HTTP y tres hablan con la
 * base. Todo lo demás decide, y por eso se puede probar.
 *
 * ⚠ La lista se afirma abajo, así que un archivo impuro nuevo no entra sin que alguien lo
 * agregue a mano y explique por qué en el commit.
 *
 * `atribucion.ts` entró el 2026-09-12: vincular un cliente atribuye sus facturas en el acto, y
 * esa escritura la comparten la pantalla (servicio.ts, `server-only`) y un script de una sola vez
 * que no puede importar un módulo `server-only`. Escribe UNA columna: lo vigila el bloque de abajo.
 */
const IMPUROS = ["servicio.ts", "sync.ts", "transporte-xmlrpc.ts", "atribucion.ts"];
const puros = archivos.filter((f) => !IMPUROS.includes(f));

describe("la frontera entre decidir y tocar el mundo", () => {
  it("sigue habiendo exactamente cuatro archivos impuros", () => {
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

  it("⛔ solo servicio.ts, sync.ts y atribucion.ts tocan la base", () => {
    for (const f of archivos) {
      if (f === "servicio.ts" || f === "sync.ts" || f === "atribucion.ts") continue;
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

const ESCRITURAS = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"];

/** Cada llamada `.<modelo>.<escritura>(…)` con su argumento entero, contando paréntesis. */
function escriturasA(src: string, modelo: string): string[] {
  const re = new RegExp(`\\.${modelo}\\.(${ESCRITURAS.join("|")})\\(`, "g");
  const out: string[] = [];
  for (const m of src.matchAll(re)) {
    const inicio = m.index ?? 0;
    let i = inicio + m[0].length;
    for (let prof = 1; i < src.length && prof > 0; i++) {
      if (src[i] === "(") prof++;
      else if (src[i] === ")") prof--;
    }
    out.push(src.slice(inicio, i));
  }
  return out;
}

/**
 * ── ⛔ VINCULAR SOLO PUEDE ESCRIBIR LA CUENTA DE UNA FACTURA ────────────────────
 * Desde el 2026-09-12 confirmar un vínculo toca el espejo. Es la puerta por la que un día
 * alguien «aprovecha» para corregir un monto o marcar una factura pagada desde la pantalla de
 * emparejado — y el espejo deja de ser lo que dice Odoo. Montos, estados y fechas son del sync;
 * los cobros, de una persona con nombre (INV25).
 */
describe("⛔ vincular solo escribe la cuenta de las facturas", () => {
  it("atribucion.ts escribe `cuentaId` y nada más en FacturaOdoo", () => {
    const escrituras = escriturasA(fuente("atribucion.ts"), "facturaOdoo");
    expect(escrituras.length).toBeGreaterThan(0);
    for (const e of escrituras) {
      expect(e, "nunca crea ni borra facturas").toMatch(/^\.facturaOdoo\.(update|updateMany)\(/);
      const data = e.match(/data:\s*\{([^{}]*)\}/)?.[1] ?? "";
      const claves = data.split(",").map((s) => s.split(":")[0]?.trim()).filter(Boolean);
      expect(claves, e).toEqual(["cuentaId"]);
    }
  });

  it("y en la bitácora solo agrega filas CUENTA", () => {
    const escrituras = escriturasA(fuente("atribucion.ts"), "facturaOdooCambio");
    expect(escrituras.length).toBeGreaterThan(0);
    for (const e of escrituras) {
      expect(e, "la bitácora es append-only").toMatch(/^\.facturaOdooCambio\.(create|createMany)\(/);
      expect(e.match(/tipo:\s*"([A-Z_]+)"/g), e).toEqual(['tipo: "CUENTA"']);
    }
  });

  it("servicio.ts no escribe el espejo por su cuenta: pasa por atribucion.ts, dentro de la transacción", () => {
    const src = fuente("servicio.ts");
    expect(escriturasA(src, "facturaOdoo")).toEqual([]);
    expect(escriturasA(src, "facturaOdooCambio")).toEqual([]);
    expect(src.match(/atribuirFacturasDelPartner\(tx,/g)).toHaveLength(2);
  });

  it("⚠ el sync lee los vínculos DESPUÉS de las facturas guardadas y no escribe la cuenta en cada fila", () => {
    /* La edición que lo pone en rojo: volver a leer los vínculos al principio «porque es más
       prolijo», o poner `cuentaId` en `datos`. Las dos pisan una atribución hecha a mitad de corrida. */
    const src = fuente("sync.ts");
    const previas = src.indexOf("const previas = await prisma.facturaOdoo.findMany");
    expect(previas).toBeGreaterThan(0);
    expect(src.indexOf("prisma.odooPartnerVinculo.findMany")).toBeGreaterThan(previas);
    const desde = src.indexOf("const datos = {");
    expect(desde).toBeGreaterThan(0);
    expect(src.slice(desde, src.indexOf("};", desde))).not.toMatch(/cuentaId/);
    expect(src).toMatch(/reatribuciones\(/);
  });
});
