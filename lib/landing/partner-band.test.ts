/**
 * lib/landing/partner-band.test.ts — la banda «Por qué Smarteam» publica HECHOS de la
 * empresa. Lo que se congela acá es lo que, si se rompe, sale hacia un prospecto:
 * una insignia que no carga, una cifra que se movió sin que nadie lo decidiera, o el
 * componente volviendo a pedirle al agente datos que ya no son suyos.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ACREDITACIONES,
  EXPERIENCIA_SMARTEAM,
  INSIGNIAS,
  INSIGNIAS_DETALLE,
  INSIGNIA_ELITE,
  INSIGNIA_TOP,
} from "./partner-band";
import { BC_DEF_BY_KEY } from "@/components/landing/configs/business-case.defs";

describe("las insignias existen en el disco", () => {
  // Un rename de archivo no rompe el build ni ningún test de tipos: se ve como una imagen
  // rota en la propuesta que el prospecto está abriendo. Mismo guard que `public/hubs`.
  it.each(INSIGNIAS.map((b) => [b.src, b] as const))("%s está en public/", (rel, insignia) => {
    const abs = path.join(process.cwd(), "public", ...rel.split("/").filter(Boolean));
    expect(fs.existsSync(abs), `falta public${rel}`).toBe(true);
    expect(insignia.alt.trim(), `${rel} sin alt`).not.toBe("");
  });

  it("son las cuatro, sin repetir archivo", () => {
    expect(INSIGNIAS).toHaveLength(4);
    expect(new Set(INSIGNIAS.map((b) => b.src)).size).toBe(4);
    // La composición de la tarjeta depende de esto: el Elite arriba, y una FILA de tres
    // (el logotipo apaisado en su chip + los dos escudos).
    expect(ACREDITACIONES).toHaveLength(2);
    expect(INSIGNIAS[0]).toBe(INSIGNIA_ELITE);
    expect(INSIGNIA_TOP.src).toContain("top-partner");
  });

  it("el pie nombra los tres programas tal como los emite HubSpot", () => {
    for (const nombre of ["Elite Solutions Partner", "Onboarding", "Service Implementation"]) {
      expect(INSIGNIAS_DETALLE).toContain(nombre);
    }
  });
});

describe("las cifras de experiencia son un HECHO fijo, no un campo", () => {
  it("son las tres que dirección aprobó, con su número y su etiqueta", () => {
    expect(EXPERIENCIA_SMARTEAM.map((f) => `${f.valor} ${f.etiqueta}`)).toEqual([
      "+200 proyectos",
      "+8 países LATAM",
      "+3.000 usuarios capacitados",
    ]);
  });

  /**
   * El corazón de la decisión del 2026-08-14: `experiencia` y `equipo` salieron del schema.
   * Si alguna vuelve, el agente puede reescribir cifras de la empresa (o resucitar el
   * "Equipo asignado" que se retiró) y encima la tercera ficha dejaría de aparecer en las
   * propuestas ya publicadas, que no tienen ese campo escrito.
   */
  it("el agente NO puede escribir las cifras ni el equipo asignado", () => {
    const props = Object.keys(
      (BC_DEF_BY_KEY.partner.schema as { properties: Record<string, unknown> }).properties,
    );
    expect(props).not.toContain("experiencia");
    expect(props).not.toContain("equipo");
    // Lo que SÍ escribe: el cierre y el resumen del cliente (el pedido de Elías).
    expect(props).toEqual(["credencial", "titular", "resumen", "referenciaSectorial"]);
    expect(BC_DEF_BY_KEY.partner.schema).toMatchObject({ required: ["credencial", "titular", "resumen"] });
  });

  /** Sin `selfTitled`, el motor pinta "Por qué Smarteam" ARRIBA del titular del cierre. */
  it("la banda pinta su propio encabezado", () => {
    expect(BC_DEF_BY_KEY.partner.selfTitled).toBe(true);
  });
});
