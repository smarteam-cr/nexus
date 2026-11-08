/**
 * lib/escala/areas-superpuestas.test.ts — las otras áreas encima del radar (La escala de la preventa, 8 nov): cada una
 * alineada eje por eje con la principal, la tarjeta de un eje con la dimensión de cada área, y al sumar o sacar un área
 * solo esa se anima (Elías: «la animación de la escala como que se corta, empieza desde cero»).
 */
import { describe, expect, it } from "vitest";
import { alinearArea, alTocarUnArea, alTocarUnNodo, areasAlCambiar, ordenConLasQueSalen, partesPorEje, piezasDeLaVista, vistaAlCambiar, vistaInicial, vistaQuieta, principalYFuera, SIN_CAMBIO, type AreaSuperpuesta } from "./areas-superpuestas";
import { cajaQueAbarca, dibujoDelRadar, GRANDE, type DimensionDelRadar } from "./radar-de-una-empresa";

const dims = (area: string, capas: ("base" | "produccion")[]): DimensionDelRadar[] =>
  capas.map((capa, i) => ({ clave: `${area}.${i + 1}`, nombre: `${area}-${i + 1}`, capa, preguntada: true, nivel: "I", puntaje: 30 }));

const VENTAS = dims("1", ["base", "base", "produccion", "produccion"]);
const MARKETING: AreaSuperpuesta = { area: "Marketing", color: "#db2777", dimensiones: dims("2", ["base", "base", "produccion"]) };
const SERVICIO: AreaSuperpuesta = { area: "Servicio", color: "#0d9488", dimensiones: dims("3", ["produccion", "base", "base", "produccion"]) };

describe("alinearArea: la parte k de cada capa sobre la parte k de la principal", () => {
  it("lleva cada eje a la dimensión real del área, por capa y en orden", () => {
    const a = alinearArea(VENTAS, SERVICIO);
    // Servicio trae su producción primero: igual cae sobre la producción de Ventas.
    expect(a.reales).toEqual({ "1.1": "3.2", "1.2": "3.3", "1.3": "3.1", "1.4": "3.4" });
    // Con la clave y el nombre del eje de la principal.
    expect(a.dims.map((d) => d.clave)).toEqual(["1.1", "1.2", "1.3", "1.4"]);
    expect(a.dims[0].nombre).toBe("1-1");
  });

  it("un eje sin parte de esa área queda sin vértice y sin real", () => {
    const a = alinearArea(VENTAS, MARKETING);
    expect(a.reales["1.4"]).toBeUndefined();
    expect(a.dims[3]).toMatchObject({ clave: "1.4", preguntada: false, nivel: null });
  });
});

describe("partesPorEje: la tarjeta de un eje con la dimensión de cada área", () => {
  it("la principal primero y después cada área en su orden; sin parte, no aparece", () => {
    const p = partesPorEje(VENTAS, [MARKETING, SERVICIO]);
    expect(p["1.1"]).toEqual(["1.1", "2.1", "3.2"]);
    expect(p["1.4"]).toEqual(["1.4", "3.4"]);
  });

  it("con una sola área, cada eje tiene solo la suya (la tarjeta queda como siempre)", () => {
    expect(partesPorEje(VENTAS, [])).toEqual({ "1.1": ["1.1"], "1.2": ["1.2"], "1.3": ["1.3"], "1.4": ["1.4"] });
  });

  it("⛔ el área que está saliendo no entra a la tarjeta", () => {
    expect(partesPorEje(VENTAS, [{ ...MARKETING, fase: "sale" }])["1.1"]).toEqual(["1.1"]);
  });
});

describe("cuál es la principal y qué se muestra con «Sumar…»", () => {
  // Ventas (1) y Marketing (2) tienen algo; Servicio (3) no.
  const conAlgo = (id: string) => id !== "3";

  it("de entrada, la última elegida con algo; una elegida sin nada se muestra con «Sumar…»", () => {
    expect(principalYFuera({ elegidas: ["1", "2"], principalId: null }, conAlgo)).toEqual({ principal: "2", fuera: [] });
    expect(principalYFuera({ elegidas: ["1", "3"], principalId: null }, conAlgo)).toEqual({ principal: "1", fuera: ["3"] });
  });

  it("⛔ sumar un área NO cambia la principal: la nueva entra encima", () => {
    const e = alTocarUnArea({ elegidas: ["1"], principalId: null }, "2", conAlgo);
    expect(e).toEqual({ elegidas: ["1", "2"], principalId: "1" });
    expect(principalYFuera(e, conAlgo).principal).toBe("1");
    // Tampoco al sumar una sin nada: esa va con «Sumar…».
    expect(principalYFuera(alTocarUnArea(e, "3", conAlgo), conAlgo)).toEqual({ principal: "1", fuera: ["3"] });
  });

  it("sin principal todavía (solo áreas sin nada), la que se suma lo es", () => {
    const e = alTocarUnArea({ elegidas: ["3"], principalId: null }, "1", conAlgo);
    expect(principalYFuera(e, conAlgo)).toEqual({ principal: "1", fuera: ["3"] });
  });

  it("tocar un nodo de otra área elegida la vuelve la principal; de una que no está elegida, nada", () => {
    const e = { elegidas: ["1", "2"], principalId: "1" };
    expect(principalYFuera(alTocarUnNodo(e, "2"), conAlgo).principal).toBe("2");
    expect(alTocarUnNodo(e, "3")).toBe(e);
  });

  it("sacar la principal la pasa a la última elegida con algo; sacar otra no la toca; la última no se saca", () => {
    const e = { elegidas: ["1", "2", "3"], principalId: "2" };
    expect(principalYFuera(alTocarUnArea(e, "2", conAlgo), conAlgo)).toEqual({ principal: "1", fuera: ["3"] });
    expect(alTocarUnArea(e, "1", conAlgo)).toEqual({ elegidas: ["2", "3"], principalId: "2" });
    const sola = { elegidas: ["1"], principalId: "1" };
    expect(alTocarUnArea(sola, "1", conAlgo)).toBe(sola);
  });

  it("⛔ la principal que se saca de la preventa y queda sin nada sigue a la vista con «Sumar…», y sumarla la devuelve", () => {
    const e = { elegidas: ["1", "2"], principalId: "1" };
    // «Sacar Ventas de la preventa» y Ventas no tenía nada más: deja de tener algo.
    const sinVentas = (id: string) => id !== "1" && id !== "3";
    expect(principalYFuera(e, sinVentas)).toEqual({ principal: "2", fuera: ["1"] });
    // «Sumar Ventas…» (el mismo botón): vuelve a ser la principal, como antes.
    expect(principalYFuera(e, conAlgo)).toEqual({ principal: "1", fuera: [] });
  });
});

describe("areasAlCambiar: al sumar o sacar un área, solo esa se anima", () => {
  const V = { area: "Ventas" };
  const M = { area: "Marketing" };
  const S = { area: "Servicio" };

  it("sumar: entra la nueva y nada sale", () => {
    expect(areasAlCambiar([V], [V, M])).toEqual({ entran: ["Marketing"], salen: [] });
  });

  it("sacar: sale la que estaba, con su último dibujo, y nada entra", () => {
    const viejo = { area: "Marketing", dibujo: "el de antes" };
    expect(areasAlCambiar([{ area: "Ventas", dibujo: "" }, viejo], [{ area: "Ventas", dibujo: "" }])).toEqual({ entran: [], salen: [viejo] });
  });

  it("⛔ cambiar cuál es la principal (el orden) no anima nada: las que estaban quedan quietas", () => {
    expect(areasAlCambiar([V, M], [M, V])).toEqual(SIN_CAMBIO);
  });

  it("dos clics seguidos: lo que se animaba sigue, y lo que vuelve antes de terminar de salir entra de nuevo", () => {
    const primero = areasAlCambiar([V, M], [V, M, S]);
    expect(primero).toEqual({ entran: ["Servicio"], salen: [] });
    const segundo = areasAlCambiar([V, M, S], [V, S], primero);
    expect(segundo).toEqual({ entran: ["Servicio"], salen: [M] });
    const tercero = areasAlCambiar([V, S], [V, S, M], segundo);
    expect(tercero).toEqual({ entran: ["Servicio", "Marketing"], salen: [] });
  });
});

describe("lo que no salta al cambiar de área (8 nov: «la altura sube porque hay más contenido o menos»)", () => {
  it("la tarjeta que sale se pliega donde estaba, no al final", () => {
    expect(ordenConLasQueSalen(["V", "M", "S"], ["V", "S"], ["M"])).toEqual(["V", "M", "S"]);
    expect(ordenConLasQueSalen(["M", "V"], ["V"], ["M"])).toEqual(["M", "V"]);
    expect(ordenConLasQueSalen(["V"], ["V", "S"], [])).toEqual(["V", "S"]);
    // Una que sale y no estaba en lo de antes va al final; una que volvió no se repite.
    expect(ordenConLasQueSalen(["V"], ["V"], ["X"])).toEqual(["V", "X"]);
    expect(ordenConLasQueSalen(["V", "M"], ["V", "M"], ["M"])).toEqual(["V", "M"]);
  });

  it("el radar usa la caja que abarca a todas las áreas: cambiar la principal no le cambia el alto", () => {
    const nombreDeNivel = (l: string) => l;
    const corta = dims("A", ["base", "base", "produccion", "produccion"]);
    const larga = dims("B", ["base", "base", "base", "produccion", "produccion", "produccion", "produccion", "produccion"]).map((d) => ({
      ...d,
      nombre: `${d.nombre} con un nombre larguísimo que empuja el rótulo para afuera`,
    }));
    const a = dibujoDelRadar(GRANDE, corta, { nombreDeNivel }).caja;
    const b = dibujoDelRadar(GRANDE, larga, { nombreDeNivel }).caja;
    const comun = cajaQueAbarca([a, b]);
    expect(cajaQueAbarca([b, a])).toEqual(comun);
    for (const c of [a, b]) {
      expect(comun[0]).toBeLessThanOrEqual(c[0]);
      expect(comun[1]).toBeLessThanOrEqual(c[1]);
      expect(comun[0] + comun[2]).toBeGreaterThanOrEqual(c[0] + c[2]);
      expect(comun[1] + comun[3]).toBeGreaterThanOrEqual(c[1] + c[3]);
    }
    expect(cajaQueAbarca([a])).toEqual(a);
  });
});

describe("la lista que se anima, con clics rápidos", () => {
  const ver = (v: Parameters<typeof piezasDeLaVista>[0]) => piezasDeLaVista(v).map((p) => (p.fase ? `${p.id}:${p.fase}` : p.id));

  it("al abrir no se anima nada; sumar entra y sacar se pliega en su lugar", () => {
    const v0 = vistaInicial(["V", "M", "S"]);
    expect(ver(v0)).toEqual(["V", "M", "S"]);
    const v1 = vistaAlCambiar(v0, ["V", "S"]);
    expect(ver(v1)).toEqual(["V", "M:sale", "S"]);
    expect(ver(vistaQuieta(v1))).toEqual(["V", "S"]);
    expect(ver(vistaAlCambiar(vistaQuieta(v1), ["V", "S", "M"]))).toEqual(["V", "S", "M:entra"]);
  });

  it("sacar dos seguidas: las dos se pliegan donde estaban, sin repetirse", () => {
    const v1 = vistaAlCambiar(vistaInicial(["V", "M", "S"]), ["V", "S"]);
    const v2 = vistaAlCambiar(v1, ["V"]);
    expect(ver(v2)).toEqual(["V", "M:sale", "S:sale"]);
    expect(ver(vistaQuieta(v2))).toEqual(["V"]);
  });

  it("sacar y volver a sumar la misma antes de que termine: vuelve a entrar, una sola vez", () => {
    const v1 = vistaAlCambiar(vistaInicial(["V", "M"]), ["V"]);
    const v2 = vistaAlCambiar(v1, ["V", "M"]);
    expect(ver(v2)).toEqual(["V", "M:entra"]);
    const v3 = vistaAlCambiar(v2, ["V"]);
    expect(ver(v3)).toEqual(["V", "M:sale"]);
    expect(ver(vistaQuieta(v3))).toEqual(["V"]);
  });
});
