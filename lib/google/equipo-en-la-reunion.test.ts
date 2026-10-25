/**
 * lib/google/equipo-en-la-reunion.test.ts — T7: quiénes de Smarteam estuvieron, con su papel, sin minutos.
 *
 * Correr: `npx vitest run lib/google/equipo-en-la-reunion.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { delEquipoEnLaReunion, type FilaDeParticipante } from "./equipo-en-la-reunion";

const delEquipo = (c: string) => c.endsWith("@smarteamcr.com");
const fila = (correo: string, x: Partial<FilaDeParticipante> = {}): FilaDeParticipante => ({
  correo,
  esDelEquipo: delEquipo(correo),
  respuesta: "ACEPTO",
  entro: null,
  ...x,
});

describe("delEquipoEnLaReunion", () => {
  it("Camosa: la organizó Liz, Andrés entró y Marco no; los de fuera no cuentan", () => {
    const r = delEquipoEnLaReunion({ organizerEmail: "LNavarro@smarteamcr.com", estadoDeConferencia: "OCURRIO" }, [
      fila("lnavarro@smarteamcr.com", { entro: new Date("2026-10-23T17:00:00Z") }),
      fila("apinzon@smarteamcr.com", { entro: new Date("2026-10-23T17:01:00Z") }),
      fila("msalas@smarteamcr.com", { respuesta: "SIN_RESPONDER" }),
      fila("jmponce@camosa.com"),
      fila("meet:users/111", { esDelEquipo: false, entro: new Date() }),
    ], delEquipo);
    expect(r).toEqual([
      { correo: "lnavarro@smarteamcr.com", organizo: true, estuvo: true, respuesta: "ACEPTO" },
      { correo: "apinzon@smarteamcr.com", organizo: false, estuvo: true, respuesta: "ACEPTO" },
      { correo: "msalas@smarteamcr.com", organizo: false, estuvo: false, respuesta: "SIN_RESPONDER" },
    ]);
  });

  it("sin la conferencia mirada no se sabe quién estuvo: null, con la respuesta a la invitación", () => {
    const r = delEquipoEnLaReunion({ organizerEmail: "lnavarro@smarteamcr.com", estadoDeConferencia: null }, [fila("apinzon@smarteamcr.com")], delEquipo);
    expect(r).toEqual([
      { correo: "lnavarro@smarteamcr.com", organizo: true, estuvo: null, respuesta: null },
      { correo: "apinzon@smarteamcr.com", organizo: false, estuvo: null, respuesta: "ACEPTO" },
    ]);
  });

  it("un organizador de fuera no aparece como del equipo", () => {
    expect(delEquipoEnLaReunion({ organizerEmail: "ricardo@insiderone.com", estadoDeConferencia: "OCURRIO" }, [], delEquipo)).toEqual([]);
  });

  it("⚠ no expone minutos ni horas: Google pide no usar la asistencia para medir desempeño", () => {
    const src = fs.readFileSync(path.join(__dirname, "equipo-en-la-reunion.ts"), "utf8");
    const interfaz = src.slice(src.indexOf("export interface DelEquipoEnLaReunion"), src.indexOf("export interface FilaDeParticipante"));
    expect(interfaz).not.toMatch(/minutos|salio|entro\s*:/);
  });
});
