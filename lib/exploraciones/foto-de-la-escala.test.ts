/**
 * lib/exploraciones/foto-de-la-escala.test.ts — la foto de la escala (lo confirmado, con de dónde sale cada nivel) y
 * qué cambió entre dos fotos. Correr: `npx vitest run lib/exploraciones/foto-de-la-escala.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { anteriorDeLaMismaVara, cambiosEntreFotos, fotoDeLaExploracion, fraseDelCambio, huellaDeLaFoto, leerFoto, mismaVara } from "./foto-de-la-escala";
import { ESCALA_DE_PRUEBA, estadoDePrueba, propuestoDePrueba, todasEn } from "./escala-de-prueba.test-helpers";

describe("la foto de la escala", () => {
  it("lleva lo confirmado con su fuente y su frase; lo propuesto y nadie usó no entra", () => {
    const e = estadoDePrueba({ "1.1": { nivel: "I", fuente: "reunion", evidencia: "Cada uno vende a su manera", porQue: "No hay proceso." }, "1.2": { nivel: "D", fuente: "test" } });
    e.propuesta.items = [propuestoDePrueba("1.3", { nivel: "F", fuente: "reunion", evidencia: "x" })];
    const f = fotoDeLaExploracion(ESCALA_DE_PRUEBA, e);
    expect(f.escalaVersion).toBe("8.8.0");
    expect(f.areas).toHaveLength(1);
    const [a] = f.areas;
    expect(a.dimensiones.find((d) => d.id === "1.1")).toMatchObject({ nivel: "I", clase: "evidencia", fuente: "reunion", cita: "Cada uno vende a su manera", porQue: "No hay proceso." });
    expect(a.dimensiones.find((d) => d.id === "1.2")).toMatchObject({ nivel: "D", clase: "hipotesis", fuente: "test" });
    expect(a.dimensiones.find((d) => d.id === "1.3")?.nivel).toBeNull();
    expect(a).toMatchObject({ conNivel: 2, conEvidencia: 1, aplican: 8, nivel: null });
  });

  it("con las ocho ubicadas, el área queda en su capa más baja y dice qué la frena", () => {
    const c = todasEn("F");
    c["1.3"] = { nivel: "I", fuente: "reunion", evidencia: "No registramos nada" };
    const [a] = fotoDeLaExploracion(ESCALA_DE_PRUEBA, estadoDePrueba(c)).areas;
    expect(a.nivel).toBe("I");
    expect(a.frena).toEqual({ capa: "base", nivel: "I", dimensiones: ["1.3"] });
    expect(a.objetivo).toBe("F");
  });

  it("sin nada confirmado no posiciona a la empresa", () => {
    expect(fotoDeLaExploracion(ESCALA_DE_PRUEBA, estadoDePrueba()).areas).toEqual([]);
  });

  it("la huella cambia con el nivel o la clase, y se lee de vuelta igual", () => {
    const f1 = fotoDeLaExploracion(ESCALA_DE_PRUEBA, estadoDePrueba({ "1.1": { nivel: "I", fuente: "test" } }));
    const f2 = fotoDeLaExploracion(ESCALA_DE_PRUEBA, estadoDePrueba({ "1.1": { nivel: "I", fuente: "reunion" } }));
    expect(huellaDeLaFoto(f1)).not.toBe(huellaDeLaFoto(f2));
    expect(huellaDeLaFoto(leerFoto(JSON.parse(JSON.stringify(f2)))!)).toBe(huellaDeLaFoto(f2));
    expect(leerFoto(null)).toBeNull();
    expect(leerFoto({ areas: [{ id: "1", dimensiones: [{ id: "1.1", nivel: "Z" }] }] })?.areas[0].dimensiones[0].nivel).toBeNull();
  });
});

describe("qué cambió", () => {
  it("subió, bajó, se ubicó, se confirmó o quedó sin nivel", () => {
    const antes = fotoDeLaExploracion(
      ESCALA_DE_PRUEBA,
      estadoDePrueba({ "1.1": { nivel: "I", fuente: "reunion" }, "1.2": { nivel: "F", fuente: "reunion" }, "1.3": { nivel: "I", fuente: "test" }, "1.4": { nivel: "D", fuente: "reunion" } }),
    );
    const ahora = fotoDeLaExploracion(
      ESCALA_DE_PRUEBA,
      estadoDePrueba({ "1.1": { nivel: "F", fuente: "reunion" }, "1.2": { nivel: "I", fuente: "reunion" }, "1.3": { nivel: "I", fuente: "reunion" }, "1.5": { nivel: "E", fuente: "reunion" } }),
    );
    const cambios = cambiosEntreFotos(antes, ahora);
    const tipo = (id: string) => cambios.find((c) => c.dimensionId === id)?.tipo;
    expect(tipo("1.1")).toBe("subio");
    expect(tipo("1.2")).toBe("bajo");
    expect(tipo("1.3")).toBe("confirmado");
    expect(tipo("1.4")).toBe("quitado");
    expect(tipo("1.5")).toBe("nuevo");
    expect(tipo("1.6")).toBeUndefined();
    expect(fraseDelCambio(cambios.find((c) => c.dimensionId === "1.1")!, (l) => `N${l}`)).toBe("Dimensión 1.1 subió de NI a NF");
  });

  it("sin foto anterior todo lo ubicado es nuevo", () => {
    const ahora = fotoDeLaExploracion(ESCALA_DE_PRUEBA, estadoDePrueba({ "1.1": { nivel: "F", fuente: "reunion" } }));
    expect(cambiosEntreFotos(null, ahora).map((c) => c.tipo)).toEqual(["nuevo"]);
  });
});

describe("una edición no se compara con otra", () => {
  const foto = (edicion: string | null) => ({ foto: { edicion } });

  it("la misma vara: la misma edición, o las dos con la escala general", () => {
    expect(mismaVara({ edicion: "Banca" }, { edicion: "Banca" })).toBe(true);
    expect(mismaVara({ edicion: null }, { edicion: null })).toBe(true);
    expect(mismaVara({ edicion: "Banca" }, { edicion: null })).toBe(false);
  });

  it("se compara con la anterior si es de la misma edición", () => {
    const previas = [foto("Banca"), foto("Retail")];
    expect(anteriorDeLaMismaVara({ edicion: "Banca" }, previas)).toEqual({ anterior: previas[0], puntoDePartida: null });
  });

  it("si la anterior es de otra edición, es un punto de partida nuevo aunque más atrás haya una de la misma", () => {
    const previas = [foto(null), foto("Banca")];
    expect(anteriorDeLaMismaVara({ edicion: "Banca" }, previas)).toEqual({ anterior: null, puntoDePartida: { desdeEdicion: null } });
  });

  it("sin nada antes no hay con qué comparar ni línea que se corte", () => {
    expect(anteriorDeLaMismaVara({ edicion: "Banca" }, [])).toEqual({ anterior: null, puntoDePartida: null });
  });
});
