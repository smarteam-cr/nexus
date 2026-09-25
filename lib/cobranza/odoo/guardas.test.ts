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
 * Los CINCO archivos que tienen permitido tocar el mundo: uno habla HTTP y cuatro hablan con la
 * base. Todo lo demás decide, y por eso se puede probar.
 *
 * ⚠ La lista se afirma abajo, así que un archivo impuro nuevo no entra sin que alguien lo
 * agregue a mano y explique por qué en el commit.
 *
 * `atribucion.ts` entró el 2026-09-12: vincular un cliente atribuye sus facturas en el acto, y
 * esa escritura la comparten la pantalla (servicio.ts, `server-only`) y un script de una sola vez
 * que no puede importar un módulo `server-only`. Escribe UNA columna: lo vigila el bloque de abajo.
 *
 * `marcas.ts` entró el 2026-09-25 por lo mismo: las marcas «está bien así» fila por fila y el cierre
 * «Ya está anulada» los escribe la pantalla, y los van a escribir el traspaso de la marca de grupo
 * de las notas de crédito y la reapertura de las facturas cerradas sin motivo. Nunca borra una
 * marca: lo vigila su bloque.
 */
const IMPUROS = ["servicio.ts", "sync.ts", "transporte-xmlrpc.ts", "atribucion.ts", "marcas.ts"];
const puros = archivos.filter((f) => !IMPUROS.includes(f));
const TOCAN_LA_BASE = ["servicio.ts", "sync.ts", "atribucion.ts", "marcas.ts"];

describe("la frontera entre decidir y tocar el mundo", () => {
  it("sigue habiendo exactamente cinco archivos impuros", () => {
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

  it("⛔ solo servicio.ts, sync.ts, atribucion.ts y marcas.ts tocan la base", () => {
    for (const f of archivos) {
      if (TOCAN_LA_BASE.includes(f)) continue;
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

/**
 * ── ⚠ LA EVIDENCIA DEL TIPO DE CAMBIO LLEGA A LA BASE ──────────────────────────
 * `evidenciaDesactualizada` tiene su test en espejo.test.ts, pero la decisión de escribir la vive
 * en sync.ts. Medido el 2026-09-12: borrar `!evidenciaVieja` de la condición de «sin cambios»
 * dejaba las 5229 pruebas en verde, y con eso un tipo de cambio corregido en Odoo —o una fila que
 * el código anterior dejó sin colones— no llega nunca, porque `calcularDeltas` no mira esa columna.
 */
describe("⚠ el sync escribe la evidencia del tipo de cambio aunque no haya deltas", () => {
  it("la condición de «sin cambios» exige que la evidencia esté al día", () => {
    const src = fuente("sync.ts");
    const desde = src.indexOf("const evidenciaVieja = evidenciaDesactualizada(");
    expect(desde, "el sync dejó de comparar la evidencia").toBeGreaterThan(0);
    const hasta = src.indexOf("sinCambio.push(previa.id)", desde);
    expect(hasta).toBeGreaterThan(desde);
    expect(src.slice(desde, hasta)).toMatch(/if\s*\([^)]*!evidenciaVieja[^)]*\)\s*\{/);
  });

  it("`datos` —el mismo objeto del alta y de la actualización— lleva las dos columnas", () => {
    const src = fuente("sync.ts");
    const desde = src.indexOf("const datos = {");
    expect(desde).toBeGreaterThan(0);
    const datos = src.slice(desde, src.indexOf("};", desde));
    expect(datos).toMatch(/montoTotalSigned:\s*f\.montoTotalSigned/);
    expect(datos).toMatch(/montoMonedaCompania:\s*f\.montoMonedaCompania/);
  });
});

/**
 * ── ⛔ UNA MARCA NO SE BORRA, Y MARCAR NO TOCA NADA MÁS ──────────────────────────
 * Elías (2026-09-25): cada marca de «Lo que no cuadra» dice quién, cuándo y por qué, se ve y se deshace, y deshacer
 * queda registrado. Hasta ese día «Volver a abrir» borraba la marca del grupo sin dejar rastro. Y marcar solo saca una
 * fila de la lista: nunca cambia un cobro ni nada del espejo de Odoo (esas dos las cuidan los bloques de arriba).
 */
describe("⛔ las marcas de «Lo que no cuadra» no se borran", () => {
  const clavesDeData = (e: string) =>
    (e.match(/data:\s*\{([^{}]*)\}/)?.[1] ?? "")
      .split(",")
      .map((s) => s.split(":")[0]?.trim())
      .filter(Boolean);

  it("marcas.ts solo crea marcas y firma su «Deshacer»: nunca las borra ni les cambia el motivo", () => {
    const escrituras = escriturasA(fuente("marcas.ts"), "diferenciaOdooMarca");
    expect(escrituras.length).toBeGreaterThan(0);
    for (const e of escrituras) {
      expect(e, "nunca borra").toMatch(/^\.diferenciaOdooMarca\.(create|createMany|updateMany)\(/);
      if (e.startsWith(".diferenciaOdooMarca.updateMany(")) expect(clavesDeData(e), e).toEqual(["deshechaPor", "deshechaEn"]);
    }
  });

  it("de una factura soltada, marcas.ts solo escribe su cierre: cuándo, quién y el motivo", () => {
    const escrituras = escriturasA(fuente("marcas.ts"), "facturaLiberada");
    expect(escrituras.length).toBeGreaterThan(0);
    for (const e of escrituras) {
      expect(e, "nunca crea ni borra una factura soltada").toMatch(/^\.facturaLiberada\.(update|updateMany)\(/);
      expect(clavesDeData(e).sort(), e).toEqual(["motivo", "resueltaEn", "resueltaPor"]);
    }
  });

  it("nadie más del módulo escribe una marca ni cierra una factura soltada: pasan por marcas.ts", () => {
    for (const f of archivos) {
      if (f === "marcas.ts") continue;
      expect(escriturasA(fuente(f), "diferenciaOdooMarca"), f).toEqual([]);
      expect(escriturasA(fuente(f), "facturaLiberada"), f).toEqual([]);
    }
  });
});
