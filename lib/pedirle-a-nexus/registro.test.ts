/**
 * lib/pedirle-a-nexus/registro.test.ts — cada documento de «✨ Pedirle a Nexus» llena su contrato entero (plan maestro de
 * «Hablar con Nexus», punto 4.4), y su implementación existe y aplica por el camino de la edición a mano.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ORIGENES_DE_NEXUS, esDeNexusConversando } from "@/lib/ai/tope-de-nexus";
import { DOCUMENTOS_CON_NEXUS } from "./registro";

const RAIZ = process.cwd();
const leer = (f: string) => fs.readFileSync(path.join(RAIZ, f), "utf8");

describe("el registro de documentos con Nexus", () => {
  it("cada contrato tiene sus ocho puntos llenos", () => {
    for (const c of DOCUMENTOS_CON_NEXUS) {
      for (const k of ["tipo", "nombre", "quienEs", "piezas", "cambiable", "versiones", "publica", "permiso", "origenDelGasto"] as const) expect(c[k].trim(), `${c.tipo}.${k}`).not.toBe("");
      expect(c.paraElImpacto.length, `${c.tipo}.paraElImpacto`).toBeGreaterThan(0);
    }
  });

  it("los tipos no se repiten", () => {
    const tipos = DOCUMENTOS_CON_NEXUS.map((c) => c.tipo);
    expect(new Set(tipos).size).toBe(tipos.length);
  });

  it("la implementación exporta leer, proponer y aplicar, y aplica por el camino de la edición a mano", () => {
    for (const c of DOCUMENTOS_CON_NEXUS) {
      const s = leer(c.servidor.archivo);
      for (const f of [c.servidor.leer, c.servidor.proponer, c.servidor.aplicar]) expect(s, `${c.tipo}: ${f}`).toMatch(new RegExp(`export async function ${f}\\b`));
      // El camino de escritura es el de siempre: la función de la edición a mano, y ninguna escritura propia a la tabla.
      expect(leer(c.aplica.archivo)).toMatch(new RegExp(`export async function ${c.aplica.funcion}\\b`));
      expect(s).toContain(`${c.aplica.funcion}(`);
      expect(s).not.toMatch(/exploracionDeVenta\.(update|upsert|create)\(/);
    }
  });

  it("su gasto cuenta dentro del tope de Nexus conversando", () => {
    for (const c of DOCUMENTOS_CON_NEXUS) {
      expect(esDeNexusConversando(c.origenDelGasto), c.origenDelGasto).toBe(true);
      expect(ORIGENES_DE_NEXUS.some((o) => c.origenDelGasto.startsWith(o))).toBe(true);
      expect(leer(c.servidor.archivo)).toContain(JSON.stringify(c.origenDelGasto));
    }
  });

  it("nunca publica: la implementación no llama a publicar", () => {
    for (const c of DOCUMENTOS_CON_NEXUS) expect(leer(c.servidor.archivo)).not.toMatch(/publicar\w*\(/i);
  });
});
