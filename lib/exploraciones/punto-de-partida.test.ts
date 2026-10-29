/**
 * lib/exploraciones/punto-de-partida.test.ts — lo medido en la preventa como punto de partida de la escala de la cuenta.
 * Correr: `npx vitest run lib/exploraciones/punto-de-partida.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { aplicarOperaciones, type EstadoDeExploracion, type Validez } from "./contenido";
import { idsDeLaEscala } from "./escala-del-lienzo";
import { VALIDADOR_ESTRICTO } from "./esquemas";
import { ESCALA_DE_PRUEBA, estadoDePrueba, propuestoDePrueba } from "./escala-de-prueba.test-helpers";
import { escalaDeLaPreventa, hayQueTraer, medidoDeLaPreventa, origenDelPuntoDePartida, type LoQueExiste } from "./punto-de-partida";

const ids = idsDeLaEscala(ESCALA_DE_PRUEBA);
const EXISTE: LoQueExiste = { dimensiones: ids.dimensiones, criterios: ids.criterios, areas: new Set(ESCALA_DE_PRUEBA.areas.map((a) => a.id)) };
const EDICIONES = new Set(["banca"]);
const VALIDEZ: Validez = {
  dimensiones: ids.dimensiones,
  criterios: ids.criterios,
  areas: EXISTE.areas,
  ediciones: EDICIONES,
  perfilesHabituales: { banca: { cierre: "con equipo", despues: "continua" } },
  escalaVersion: ESCALA_DE_PRUEBA.version,
};

/** El escritor de verdad (la misma función que aplica el servidor): una operación que no corresponde tumba la tanda. */
function aplicar(estado: EstadoDeExploracion, ops: Parameters<typeof aplicarOperaciones>[1]): EstadoDeExploracion {
  const r = aplicarOperaciones(estado, ops, VALIDEZ, VALIDADOR_ESTRICTO, { por: "cse@smarteamcr.com", en: "2026-10-28T12:00:00.000Z" });
  if (!r.ok) throw new Error(r.error);
  return r.estado;
}

describe("lo medido en la preventa es el punto de partida de la cuenta", () => {
  it("trae los niveles con su frase y su porqué, lo que pide Funcional y las áreas, y el escritor lo acepta", () => {
    const preventa = estadoDePrueba({
      "1.1": { nivel: "I", fuente: "reunion", evidencia: "Cada uno vende a su manera", porQue: "No hay proceso." },
      "1.2": { nivel: "D", fuente: "test" },
    });
    preventa.contenido.falta = { "1.1.F1": { estado: "no_tiene", cita: "No lo tenemos" } };
    const cuenta = estadoDePrueba({}, { areas: [] });
    expect(hayQueTraer(preventa, cuenta)).toBe(true);
    expect(escalaDeLaPreventa(preventa, cuenta, EDICIONES)).toEqual([]);
    const m = medidoDeLaPreventa(preventa, cuenta, EXISTE);
    expect(m).toMatchObject({ dimensiones: 2, afuera: 0 });
    const despues = aplicar(cuenta, m.ops);
    expect(despues.areas).toEqual(["1"]);
    expect(despues.contenido.chequeo["1.1"]).toEqual({ nivel: "I", fuente: "reunion", evidencia: "Cada uno vende a su manera", porQue: "No hay proceso." });
    expect(despues.contenido.chequeo["1.2"]).toEqual({ nivel: "D", fuente: "test" });
    expect(despues.contenido.falta["1.1.F1"]).toEqual({ estado: "no_tiene", cita: "No lo tenemos" });
  });

  it("lo que no existe en la escala de la cuenta (otra edición, una dimensión retirada) se queda afuera y no tumba lo demás", () => {
    const preventa = estadoDePrueba({ "1.1": { nivel: "F", fuente: "reunion" }, "9.9": { nivel: "I", fuente: "reunion" } });
    // Un criterio de otra edición, marcado antes de cambiarla en la preventa: cambiar de edición no lo borra.
    preventa.contenido.falta = { "1.1.F1": { estado: "tiene" }, "1.1.X7": { estado: "no_tiene" } };
    const cuenta = estadoDePrueba();
    const m = medidoDeLaPreventa(preventa, cuenta, EXISTE);
    expect(m).toMatchObject({ dimensiones: 1, afuera: 2 });
    const despues = aplicar(cuenta, m.ops);
    expect(Object.keys(despues.contenido.chequeo)).toEqual(["1.1"]);
    expect(Object.keys(despues.contenido.falta)).toEqual(["1.1.F1"]);
  });

  it("lo que el agente propuso en la preventa y nadie usó no viaja", () => {
    const preventa = estadoDePrueba({ "1.1": { nivel: "F", fuente: "reunion" } });
    preventa.propuesta.items = [propuestoDePrueba("1.3", { nivel: "E", fuente: "reunion", evidencia: "x" })];
    const m = medidoDeLaPreventa(preventa, estadoDePrueba(), EXISTE);
    expect(m.ops.flatMap((o) => (o.op === "nivel" ? [o.dimensionId] : []))).toEqual(["1.1"]);
  });

  it("una cuenta que ya tiene niveles no se toca, y sin nada medido no hay nada que traer", () => {
    const preventa = estadoDePrueba({ "1.1": { nivel: "F", fuente: "reunion" } });
    expect(hayQueTraer(preventa, estadoDePrueba({ "1.4": { nivel: "I", fuente: "vendedor" } }))).toBe(false);
    expect(hayQueTraer(estadoDePrueba(), estadoDePrueba())).toBe(false);
  });

  it("la edición que eligió una persona sigue elegida a mano, con el perfil de la preventa", () => {
    const preventa = estadoDePrueba({ "1.1": { nivel: "F", fuente: "reunion" } }, { edicion: "banca", perfilCierre: "transaccional", perfilDespues: "única" });
    preventa.contenido.edicionElegida = { por: "vendedor" };
    const despues = aplicar(estadoDePrueba(), escalaDeLaPreventa(preventa, estadoDePrueba(), EDICIONES));
    expect(despues).toMatchObject({ edicion: "banca", perfilCierre: "transaccional", perfilDespues: "única" });
    expect(despues.contenido.edicionElegida?.por).toBe("vendedor");
  });

  it("la que eligió el agente o la industria sigue siendo automática", () => {
    const preventa = estadoDePrueba({ "1.1": { nivel: "F", fuente: "reunion" } }, { edicion: "banca" });
    preventa.contenido.edicionElegida = { por: "industria", razon: "La industria en HubSpot es Banca." };
    const despues = aplicar(estadoDePrueba(), escalaDeLaPreventa(preventa, estadoDePrueba(), EDICIONES));
    expect(despues.edicion).toBe("banca");
    expect(despues.contenido.edicionElegida).toMatchObject({ por: "industria", razon: "La industria en HubSpot es Banca." });
  });

  it("una edición que ya no está publicada no se trae: la cuenta sigue con la suya", () => {
    const preventa = estadoDePrueba({ "1.1": { nivel: "F", fuente: "reunion" } }, { edicion: "retirada" });
    expect(escalaDeLaPreventa(preventa, estadoDePrueba(), EDICIONES)).toEqual([]);
  });
});

describe("de dónde parte la cuenta", () => {
  const candidata = (id: string, dia: string, medida: boolean) => ({
    id,
    desde: id,
    actualizada: new Date(`${dia}T12:00:00Z`),
    estado: estadoDePrueba(medida ? { "1.1": { nivel: "F", fuente: "reunion" } } : {}),
  });

  it("de la que midió algo más recientemente, la preventa o un proyecto: una sola", () => {
    const r = origenDelPuntoDePartida([candidata("la preventa", "2026-03-01", true), candidata("el proyecto", "2026-09-01", true), candidata("vacía", "2026-10-01", false)]);
    expect(r?.id).toBe("el proyecto");
  });

  it("si nadie midió nada, de ninguna", () => {
    expect(origenDelPuntoDePartida([candidata("vacía", "2026-10-01", false)])).toBeNull();
    expect(origenDelPuntoDePartida([])).toBeNull();
  });
});
