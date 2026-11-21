/**
 * Los hechos de cada nota de «Lo que sabes del cliente» (21 nov): se agrupan por su nota, con qué, quién lo dijo y
 * cuándo; solo notas de «Lo que sabes» que siguen en la preventa. Y el lector va acotado a la preventa y a su cliente.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agruparPorNota, type FilaDeHechoDeNota } from "./hechos-de-las-notas";

const fila = (o: Partial<FilaDeHechoDeNota>): FilaDeHechoDeNota => ({
  id: "h1",
  notaClave: "sabido:a1",
  tipo: "cuenta",
  frase: "La empresa pierde plata por su cartera vencida",
  dichoPorEmail: "liz@smarteam.test",
  fechaDeLaReunion: new Date("2026-11-21T15:00:00Z"),
  ...o,
});

describe("los hechos de cada nota", () => {
  it("por su nota, con el rótulo del tipo, quién lo dijo (su nombre) y cuándo", () => {
    const r = agruparPorNota(
      [fila({}), fila({ id: "h2", tipo: "riesgo", frase: "Cambian el ERP en enero" }), fila({ id: "h3", notaClave: "sabido:b2", dichoPorEmail: "marco@smarteam.test" })],
      new Map([["liz@smarteam.test", "Liz Flores"]]),
      new Set(["sabido:a1", "sabido:b2"]),
    );
    expect(r["sabido:a1"]).toEqual([
      { id: "h1", rotulo: "De la cuenta", frase: "La empresa pierde plata por su cartera vencida", dichoPor: "Liz Flores", en: "2026-11-21T15:00:00.000Z" },
      { id: "h2", rotulo: "Riesgo", frase: "Cambian el ERP en enero", dichoPor: "Liz Flores", en: "2026-11-21T15:00:00.000Z" },
    ]);
    // Sin nombre en el equipo: la parte del correo antes de la arroba.
    expect(r["sabido:b2"][0].dichoPor).toBe("marco");
  });

  it("una nota quitada, o una clave que no es de «Lo que sabes», no muestra hechos", () => {
    const r = agruparPorNota([fila({}), fila({ id: "h2", notaClave: "sesion:x" }), fila({ id: "h3", notaClave: null })], new Map(), new Set(["sabido:otra"]));
    expect(r).toEqual({});
  });

  it("el lector pide la preventa Y su cliente (de la fila), y solo las notas de esa preventa", () => {
    const src = readFileSync("lib/exploraciones/hechos-de-las-notas-server.ts", "utf8");
    expect(src).toContain("where: { exploracionId, clientId: fila.clientId, notaClave: { in: [...notas] } }");
  });
});
