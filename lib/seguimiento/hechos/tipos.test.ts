import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIAS_PARA_VENCER,
  LARGO_CITA,
  MAX_HECHOS_POR_REUNION,
  MOTIVOS_DE_DESCARTE,
  ROTULO_DEL_MOTIVO,
  ROTULO_DEL_TIPO,
  TEMAS_DE_ACUERDO,
  TIPOS_DE_HECHO,
  TIPOS_DE_HECHO_DE_LA_LISTA,
  TIPOS_DE_SENAL,
  esAmbito,
  esSenal,
  esTipoDeHecho,
} from "./tipos";

describe("los tipos de hecho", () => {
  it("son los nueve de DECISIONS, en el orden de la prueba de admisión", () => {
    expect([...TIPOS_DE_HECHO]).toEqual(["cuenta", "persona", "acuerdo", "resultado", "proceso_hoy", "queja", "riesgo", "senal_cronograma", "senal_etapa"]);
    expect([...TIPOS_DE_HECHO_DE_LA_LISTA, ...TIPOS_DE_SENAL]).toEqual([...TIPOS_DE_HECHO]);
  });

  it("un compromiso y un pedido nuevo NO son hechos", () => {
    for (const no of ["compromiso", "pedido", "pedido_fuera_de_alcance", "decision"]) expect(esTipoDeHecho(no)).toBe(false);
  });

  it("las señales se reconocen como señales", () => {
    expect(esSenal("senal_cronograma")).toBe(true);
    expect(esSenal("senal_etapa")).toBe(true);
    expect(esSenal("acuerdo")).toBe(false);
  });

  it("los temas de un acuerdo", () => {
    expect([...TEMAS_DE_ACUERDO]).toEqual(["pipeline", "propiedades", "integracion", "automatizacion", "conversaciones", "proceso_despues", "alcance"]);
  });

  it("cada tipo y cada motivo tienen su rótulo", () => {
    for (const t of TIPOS_DE_HECHO) expect(ROTULO_DEL_TIPO[t]).toBeTruthy();
    for (const m of MOTIVOS_DE_DESCARTE) expect(ROTULO_DEL_MOTIVO[m]).toBeTruthy();
  });

  it("las constantes del plan", () => {
    expect(MAX_HECHOS_POR_REUNION).toBe(12);
    expect([...LARGO_CITA]).toEqual([12, 400]);
    expect(DIAS_PARA_VENCER).toBe(30);
  });
});

describe("el ámbito", () => {
  it("«cuenta» o un P# de la lista", () => {
    expect(esAmbito("cuenta")).toBe(true);
    expect(esAmbito("P1")).toBe(true);
    expect(esAmbito("P12")).toBe(true);
  });

  it("cualquier otra cosa no es un ámbito", () => {
    for (const no of ["P0", "p1", "P", "proyecto", "", "P1 ", null, 3]) expect(esAmbito(no)).toBe(false);
  });
});

describe("DECISIONS y el código dicen los mismos tipos", () => {
  it("cada tipo aparece en «Hechos, enrutador y novedades»", () => {
    const decisiones = readFileSync(join(__dirname, "..", "..", "..", "docs", "DECISIONS.md"), "utf8");
    const inicio = decisiones.indexOf("## Hechos, enrutador y novedades");
    expect(inicio).toBeGreaterThan(-1);
    const fin = decisiones.indexOf("\n## ", inicio + 5);
    const seccion = decisiones.slice(inicio, fin > -1 ? fin : undefined);
    for (const t of TIPOS_DE_HECHO) expect(seccion, `falta «${t}» en DECISIONS`).toContain(`\`${t}\``);
  });
});
