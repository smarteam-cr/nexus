/**
 * lib/cobranza/mercury/guardas.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/mercury --project unit`.
 *
 * Guardas de ARMADO de la copia de Mercury, las mismas que protegen la de Odoo (lib/cobranza/odoo/guardas.test.ts): no
 * prueban qué calcula, prueban que siga siendo la clase de módulo que se decidió. Leen el fuente SIN comentarios: si no,
 * una guarda se cumple con el párrafo que explica por qué existe.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = __dirname;
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const archivos = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const fuente = (f: string) => sinComentarios(readFileSync(join(DIR, f), "utf8"));

/** Los únicos que tocan el mundo: uno habla con Mercury y los otros con la base. Todo lo demás decide. */
const HABLA_CON_MERCURY = "transporte-http.ts";
const TOCAN_LA_BASE = ["sync.ts", "servicio.ts"];

describe("la frontera entre decidir y tocar el mundo", () => {
  it("⛔ solo transporte-http.ts habla con la red", () => {
    for (const f of archivos) {
      if (f === HABLA_CON_MERCURY) continue;
      expect(fuente(f), `${f} habla HTTP directo`).not.toMatch(/node:https|node:http\b|\bfetch\s*\(/);
    }
  });

  it("⛔ solo sync.ts y servicio.ts tocan la base", () => {
    for (const f of archivos) {
      if (TOCAN_LA_BASE.includes(f)) continue;
      expect(fuente(f), `${f} importa la base`).not.toMatch(/@prisma\/client"|from\s+["']@\/lib\/db/);
    }
  });

  it("⛔ ningún módulo puro lee el reloj", () => {
    for (const f of archivos) {
      if (f === HABLA_CON_MERCURY || TOCAN_LA_BASE.includes(f)) continue;
      expect(fuente(f), `${f} lee el reloj`).not.toMatch(/new Date\(\s*\)|Date\.now\(/);
    }
  });
});

describe("⛔ Nexus no escribe en Mercury, y el token no se ve", () => {
  it("el cliente de la API solo pide GET", () => {
    const src = fuente(HABLA_CON_MERCURY);
    expect(src).toMatch(/method:\s*"GET"/);
    expect(src, "un pedido que escribe").not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
  });

  it("el cliente de la API no imprime nada: el token viaja en un encabezado que no se loguea", () => {
    expect(fuente(HABLA_CON_MERCURY)).not.toMatch(/console\./);
  });
});

describe("ningún cobro se toca desde acá", () => {
  it("⛔ nada del módulo escribe en Cobro ni pasa por el chokepoint de su estado", () => {
    /* Lo cobrado lo confirma una persona (INV3). La copia propone y la pantalla lleva a la persona al cobro. */
    for (const f of archivos) {
      expect(fuente(f), `${f} escribe en Cobro`).not.toMatch(/(prisma|tx)\.cobro\.(update|create|upsert|delete)/);
      expect(fuente(f), `${f} importa cambiarEstadoCobro`).not.toMatch(/cambiarEstadoCobro/);
    }
  });
});
