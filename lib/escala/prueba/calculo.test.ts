/**
 * lib/escala/prueba/calculo.test.ts — probar la escala con cualquier empresa (N2): el nivel de cada área sale del mismo
 * chequeo del mapa, Wherex nunca entra y el resumen cuenta contra el criterio de la tarjeta (4 de cada 5).
 */
import { describe, expect, it } from "vitest";
import type { Letra } from "@/lib/escala/documento/tipos";
import { chequeoDelMapa, posicionesDelMapa } from "@/lib/exploraciones/mapa";
import { ESCALA_DE_PRUEBA, estadoDePrueba, propuestoDePrueba, todasEn } from "@/lib/exploraciones/escala-de-prueba.test-helpers";
import { propuestaVacia } from "@/lib/exploraciones/contenido";
import {
  coincidenLoSuficiente,
  decidirLaComparacion,
  elegirLaFuente,
  empresaExcluida,
  nivelesDeLaPrueba,
  resumenDeLasPruebas,
  type AreaDeLaPrueba,
  type FilaDePrueba,
} from "./calculo";

describe("Wherex nunca entra a la prueba", () => {
  it.each(["Wherex", "WHEREX", "Wherex S.A.", "Where-x Chile", " wherex  "])("«%s» queda fuera", (n) => {
    expect(empresaExcluida(n)).toBe(true);
  });

  it.each(["Honda Costa Rica", "kölbi", "Where Express", "", null, undefined])("«%s» entra", (n) => {
    expect(empresaExcluida(n)).toBe(false);
  });

  it("una fila de Wherex que se haya colado no cuenta en el resumen", () => {
    const r = resumenDeLasPruebas([fila({ clientId: "w", empresa: "Wherex" }), fila({ clientId: "a" })]);
    expect(r[0].empresas).toBe(1);
    expect(r[0].filas.map((f) => f.clientId)).toEqual(["a"]);
  });
});

/** El chequeo sin una dimensión. */
function sinLa(id: string, chequeo: ReturnType<typeof todasEn>): ReturnType<typeof todasEn> {
  return Object.fromEntries(Object.entries(chequeo).filter(([k]) => k !== id));
}

describe("el nivel que da la escala", () => {
  it("con todo confirmado, es el del chequeo del mapa (el mismo de la preventa y la ficha)", () => {
    const estado = estadoDePrueba({ ...todasEn("E"), "1.2": { nivel: "F", fuente: "reunion", evidencia: "x" } });
    const [ventas] = nivelesDeLaPrueba(ESCALA_DE_PRUEBA, estado);
    const delMapa = chequeoDelMapa(ESCALA_DE_PRUEBA, ["1"], posicionesDelMapa(estado, [])).areas[0].nivel;
    expect(ventas).toMatchObject({ id: "1", nombre: "Ventas", nivel: "F", aplican: 8, conEvidencia: 8, hipotesis: 0, propuestas: 0, faltan: 0 });
    expect(ventas.nivel).toBe(delMapa);
  });

  it("mientras falte una dimensión, no hay nivel y dice cuántas faltan", () => {
    const sinUna = sinLa("1.8", todasEn("F"));
    const [ventas] = nivelesDeLaPrueba(ESCALA_DE_PRUEBA, estadoDePrueba(sinUna));
    expect(ventas.nivel).toBeNull();
    expect(ventas.faltan).toBe(1);
  });

  it("lo que propuso el agente completa lo que falta, y se cuenta aparte", () => {
    const sinUna = sinLa("1.8", todasEn("F"));
    const estado = estadoDePrueba(sinUna, {
      propuesta: { ...propuestaVacia(), items: [propuestoDePrueba("1.8", { nivel: "I", fuente: "reunion", evidencia: "No llevamos nada" })] },
    });
    const [ventas] = nivelesDeLaPrueba(ESCALA_DE_PRUEBA, estado);
    expect(ventas).toMatchObject({ nivel: "I", propuestas: 1, faltan: 0, conEvidencia: 8 });
  });

  it("una hipótesis cuenta para el nivel, pero como hipótesis", () => {
    const estado = estadoDePrueba({ ...todasEn("F"), "1.1": { nivel: "F", fuente: "test" } });
    const [ventas] = nivelesDeLaPrueba(ESCALA_DE_PRUEBA, estado);
    expect(ventas).toMatchObject({ nivel: "F", conEvidencia: 7, hipotesis: 1 });
  });
});

let n = 0;
function fila(p: Partial<FilaDePrueba> = {}): FilaDePrueba {
  n++;
  return {
    id: `f${n}`,
    clientId: "a",
    empresa: "Empresa A",
    industria: "Banca",
    areaId: "1",
    areaNombre: "Ventas",
    escalaVersion: "8.9.1",
    esBorrador: false,
    revision: null,
    nivelDeLaEscala: "F",
    nivelQueCree: "F",
    creePorEmail: "cse@smarteamcr.com",
    registradoPorEmail: "cse@smarteamcr.com",
    en: `2026-10-26T10:${String(n).padStart(2, "0")}:00.000Z`,
    ...p,
  };
}

describe("el criterio de la tarjeta: coinciden en al menos 4 de cada 5", () => {
  it.each([
    [4, 5, true],
    [3, 5, false],
    [8, 10, true],
    [7, 10, false],
    [0, 0, false],
  ])("%i de %i → %s", (c, total, esperado) => {
    expect(coincidenLoSuficiente(c, total)).toBe(esperado);
  });
});

describe("el resumen para los super admin", () => {
  it("cuenta solo la última comparación de cada empresa y área: quien vuelve a probar corrige", () => {
    const r = resumenDeLasPruebas([
      fila({ clientId: "a", nivelQueCree: "I", en: "2026-10-26T09:00:00.000Z" }),
      fila({ clientId: "a", nivelQueCree: "F", en: "2026-10-26T11:00:00.000Z" }),
    ]);
    expect(r[0]).toMatchObject({ comparaciones: 1, coinciden: 1 });
  });

  it("un borrador editado (otra revisión) no se cuenta junto con el de antes", () => {
    const r = resumenDeLasPruebas([
      fila({ escalaVersion: "9.0.0", esBorrador: true, revision: 3, nivelQueCree: "I", en: "2026-10-26T09:00:00.000Z" }),
      fila({ escalaVersion: "9.0.0", esBorrador: true, revision: 4, en: "2026-10-26T11:00:00.000Z" }),
    ]);
    expect(r.map((v) => [v.version, v.revision, v.coinciden, v.comparaciones])).toEqual([
      ["9.0.0", 4, 1, 1],
      ["9.0.0", 3, 0, 1],
    ]);
  });

  it("separa la versión publicada del borrador", () => {
    const r = resumenDeLasPruebas([fila({ escalaVersion: "8.9.1" }), fila({ escalaVersion: "9.0.0", esBorrador: true })]);
    expect(r.map((v) => [v.version, v.esBorrador])).toEqual([
      ["9.0.0", true],
      ["8.9.1", false],
    ]);
  });

  it("dice si la escala queda más arriba o más abajo de lo que cree el equipo", () => {
    const r = resumenDeLasPruebas([
      fila({ clientId: "a", nivelDeLaEscala: "E", nivelQueCree: "F" }),
      fila({ clientId: "b", nivelDeLaEscala: "I", nivelQueCree: "F" }),
      fila({ clientId: "c", nivelDeLaEscala: "D" as Letra, nivelQueCree: "F" }),
    ]);
    expect(r[0]).toMatchObject({ coinciden: 0, escalaMasAlta: 1, escalaMasBaja: 2 });
  });

  it("cumple con 5 empresas de 3 industrias y 4 de cada 5 comparaciones iguales", () => {
    const industrias = ["Banca", "Banca", "Educación", "Turismo", "Turismo"];
    const filas = industrias.map((industria, i) => fila({ clientId: `c${i}`, industria, nivelQueCree: i === 0 ? "I" : "F" }));
    const [v] = resumenDeLasPruebas(filas);
    expect(v).toMatchObject({ empresas: 5, comparaciones: 5, coinciden: 4, sinIndustria: 0 });
    expect(v.industrias).toEqual([
      { nombre: "Banca", empresas: 2 },
      { nombre: "Turismo", empresas: 2 },
      { nombre: "Educación", empresas: 1 },
    ]);
    expect(v.cumple).toEqual({ empresas: true, industrias: true, coincidencia: true, todo: true });
  });

  it("no cumple con 4 empresas, ni con dos industrias, ni con 3 de 5", () => {
    const pocas = resumenDeLasPruebas([0, 1, 2, 3].map((i) => fila({ clientId: `c${i}`, industria: ["A", "B", "C", "C"][i] })))[0];
    expect(pocas.cumple.empresas).toBe(false);
    const dos = resumenDeLasPruebas([0, 1, 2, 3, 4].map((i) => fila({ clientId: `c${i}`, industria: i < 3 ? "A" : null })))[0];
    expect(dos).toMatchObject({ sinIndustria: 2 });
    expect(dos.cumple.industrias).toBe(false);
    const tres = resumenDeLasPruebas([0, 1, 2, 3, 4].map((i) => fila({ clientId: `c${i}`, industria: `I${i}`, nivelQueCree: i < 2 ? "O" : "F" })))[0];
    expect(tres.cumple).toMatchObject({ empresas: true, industrias: true, coincidencia: false, todo: false });
  });

  it("por área", () => {
    const [v] = resumenDeLasPruebas([fila({ areaId: "2", areaNombre: "Marketing", nivelQueCree: "I" }), fila({ areaId: "1" })]);
    expect(v.porArea).toEqual([
      { areaId: "1", areaNombre: "Ventas", comparaciones: 1, coinciden: 1 },
      { areaId: "2", areaNombre: "Marketing", comparaciones: 1, coinciden: 0 },
    ]);
  });
});

function area(p: Partial<AreaDeLaPrueba> = {}): AreaDeLaPrueba {
  return { id: "1", nombre: "Ventas", nivel: "F", aplican: 8, conEvidencia: 8, hipotesis: 0, propuestas: 0, faltan: 0, ...p };
}

describe("de qué exploración salen los niveles", () => {
  const vacia = { exploracionId: "e-vacia", areas: [area({ nivel: null, faltan: 8 })] };
  const conNivel = { exploracionId: "e-con", areas: [area()] };

  it("la pedida, si es de la empresa", () => {
    expect(elegirLaFuente([vacia, conNivel], "e-vacia")?.exploracionId).toBe("e-vacia");
  });

  it("sin pedir, la más reciente que da algún nivel", () => {
    expect(elegirLaFuente([vacia, conNivel], null)?.exploracionId).toBe("e-con");
  });

  it("⛔ una exploración que no está entre las de la empresa no se elige: cae al defecto", () => {
    expect(elegirLaFuente([vacia, conNivel], "de-otra-empresa")?.exploracionId).toBe("e-con");
  });

  it("sin ninguna con nivel, la más reciente; sin ninguna, nada", () => {
    expect(elegirLaFuente([vacia], null)?.exploracionId).toBe("e-vacia");
    expect(elegirLaFuente([], "x")).toBeNull();
  });
});

describe("si una comparación entra", () => {
  const base = {
    excluida: false,
    fuente: "e1",
    exploracionPedida: "e1",
    version: "8.9.1",
    areas: [area({ nivel: "E" }), area({ id: "2", nombre: "Marketing", nivel: null, faltan: 2 })],
    areaId: "1",
    quienes: [{ email: "yo@smarteamcr.com" }, { email: "cse@smarteamcr.com" }],
    creePorEmail: "CSE@smarteamcr.com ",
  };

  it("entra con el nivel RECALCULADO del área y el correo de quien cree, normalizado", () => {
    expect(decidirLaComparacion(base)).toEqual({ estado: "entra", area: area({ nivel: "E" }), creePorEmail: "cse@smarteamcr.com" });
  });

  it("⛔ Wherex no entra", () => {
    expect(decidirLaComparacion({ ...base, excluida: true }).estado).toBe("excluida");
  });

  it("⛔ con una exploración de otra empresa (no quedó elegida), no entra", () => {
    expect(decidirLaComparacion({ ...base, exploracionPedida: "de-otra-empresa" })).toMatchObject({ estado: "no-existe" });
  });

  it("un área sin nivel dice cuántas dimensiones faltan", () => {
    expect(decidirLaComparacion({ ...base, areaId: "2" })).toEqual({ estado: "sin-nivel", faltan: 2 });
  });

  it("quien cree tiene que ser quien prueba o el CSE", () => {
    expect(decidirLaComparacion({ ...base, creePorEmail: "otro@smarteamcr.com" }).estado).toBe("quien-no");
  });

  it("sin escala con que medir, o con un área que no existe, no entra", () => {
    expect(decidirLaComparacion({ ...base, version: null }).estado).toBe("no-existe");
    expect(decidirLaComparacion({ ...base, areaId: "9" }).estado).toBe("no-existe");
  });
});
