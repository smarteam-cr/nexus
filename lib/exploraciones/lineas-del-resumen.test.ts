/**
 * lib/exploraciones/lineas-del-resumen.test.ts — lo que muestra el Resumen de la preventa (22 nov): los 4 primeros de cada
 * casilla en el orden que dejó la persona, la comprobación de cifras y las particularidades más recientes con su fecha.
 */
import { describe, expect, it } from "vitest";
import { cifrasDe, cifrasQueNoCuadran, lineasDe, particularidadesRecientes, primerasDe, rotuloDelResto } from "./lineas-del-resumen";
import { aplicarOperaciones, claveDeItemDeLista, contenidoVacio, VALIDADOR_LIBRE, type EstadoDeExploracion, type Validez } from "./contenido";
import { leerContenido } from "./esquemas";

describe("lineasDe: en el orden que dejó la persona", () => {
  it("las metas con sus cifras y el equipo adelante, sin reordenar por equipo", () => {
    const metas = [
      { que: "Cobrar a tiempo", equipo: "servicio" as const },
      { que: "Cerrar más", actual: "18 %", objetivo: "25 %", para: "junio", equipo: "ventas" as const },
      { que: "Crecer la empresa" },
    ];
    const l = lineasDe("metas", metas);
    expect(l[0]).toMatch(/· Cobrar a tiempo$/);
    expect(l[1]).toMatch(/· Cerrar más: de 18 % a 25 % para junio$/);
    expect(l[2]).toBe("Crecer la empresa");
  });

  it("el Resumen ve los 4 primeros y cuenta el resto; la casilla rotula el resto", () => {
    expect(primerasDe(["a", "b", "c", "d", "e", "f"])).toEqual({ lineas: ["a", "b", "c", "d"], mas: 2 });
    expect(primerasDe(["a"])).toEqual({ lineas: ["a"], mas: 0 });
    expect(rotuloDelResto("metas")).toBe("Más metas");
    expect(rotuloDelResto("planes")).toBe("Más planes");
    expect(rotuloDelResto("particularidades")).toBeNull();
  });
});

describe("cifrasQueNoCuadran: ninguna inventada ni al revés", () => {
  it("1.500, 1,500 y 1500 son la misma; un decimal no es un entero", () => {
    expect([...cifrasDe("US$ 1.500 y 1,500 y 1500")]).toEqual(["1500"]);
    expect([...cifrasDe("2,5 y 2.5")]).toEqual(["2.5"]);
    expect([...cifrasDe("Son 40. Después 12")].sort()).toEqual(["12", "40"]);
  });

  it("dice cuáles inventó, cuáles soltó y qué rango dio vuelta", () => {
    expect(cifrasQueNoCuadran(["de 2 a 5"], ["de 2 a 6"])).toEqual({ inventadas: ["6"], perdidas: ["5"], invertidas: [] });
    expect(cifrasQueNoCuadran(["Subir de 2 % a 5 %"], ["De 5 % a 2 %"]).invertidas).toEqual(["5→2"]);
    expect(cifrasQueNoCuadran(["Churn de 2,5 % hoy"], ["Churn de 25 %"]).inventadas).toEqual(["25"]);
  });

  it("el orden solo se mira en un rango: «desde 1990 y 400,000» puede quedar «400,000 desde 1990» (Cemaco)", () => {
    const c = cifrasQueNoCuadran(["Registros desde 1990 y supera los 400,000 contactos"], ["400,000 contactos desde 1990"]);
    expect(c).toEqual({ inventadas: [], perdidas: [], invertidas: [] });
  });
});

describe("las particularidades: las 5 más recientes, con su fecha", () => {
  const k = (t: string) => claveDeItemDeLista("particularidades", t);

  it("sin fechas, el orden de llegada al revés (la última entró al final)", () => {
    const lista = ["a", "b", "c", "d", "e", "f", "g"];
    expect(particularidadesRecientes(lista, undefined, k, 5).map((p) => p.texto)).toEqual(["g", "f", "e", "d", "c"]);
  });

  it("las fechadas van primero, de la más nueva a la más vieja", () => {
    const lista = ["vieja", "nueva", "media"];
    const fechas = { [k("nueva")]: "2026-11-23", [k("media")]: "2026-11-22" };
    expect(particularidadesRecientes(lista, fechas, k)).toEqual([
      { texto: "nueva", fecha: "2026-11-23" },
      { texto: "media", fecha: "2026-11-22" },
      { texto: "vieja", fecha: null },
    ]);
  });
});

describe("aplicarOperaciones: le pone el día a cada particularidad NUEVA", () => {
  const estado = (particularidades?: string[], fechas?: Record<string, string>): EstadoDeExploracion => ({
    contenido: { ...contenidoVacio(), casillas: particularidades ? { particularidades } : {}, ...(fechas ? { fechasDeLasParticularidades: fechas } : {}) },
    propuesta: { version: 1, items: [], leidas: { sesiones: [], hubspot: [], documentos: [] }, corridas: [], guia: null } as unknown as EstadoDeExploracion["propuesta"],
    areas: [],
    edicion: null,
    perfilCierre: null,
    perfilDespues: null,
    responsableEmail: null,
    archivada: false,
  });
  const validez = { dimensiones: new Set(), criterios: new Set(), areas: new Set(), ediciones: new Set(), escalaVersion: null } as unknown as Validez;
  const quien = { por: "x@smarteam.cr", en: "2026-11-22T18:00:00.000Z" };

  it("la que entra hoy queda con el día de hoy; las de antes siguen sin fecha", () => {
    const r = aplicarOperaciones(estado(["Vieja"]), [{ op: "casilla", clave: "particularidades", valor: ["Vieja", "Nueva"] }], validez, VALIDADOR_LIBRE, quien);
    expect(r.ok && r.estado.contenido.fechasDeLasParticularidades).toEqual({ [claveDeItemDeLista("particularidades", "Nueva")]: "2026-11-22" });
  });

  it("el día es el de Costa Rica: a las 21:00 de Costa Rica en UTC ya es mañana", () => {
    const r = aplicarOperaciones(estado([]), [{ op: "casilla", clave: "particularidades", valor: ["De noche"] }], validez, VALIDADOR_LIBRE, { por: null, en: "2026-11-23T03:00:00.000Z" });
    expect(r.ok && r.estado.contenido.fechasDeLasParticularidades).toEqual({ [claveDeItemDeLista("particularidades", "De noche")]: "2026-11-22" });
  });

  it("corregir el texto de una vieja la vuelve nueva: entra con el día de hoy (decidido así, se dice en DECISIONS)", () => {
    const r = aplicarOperaciones(estado(["Vieja"]), [{ op: "casilla", clave: "particularidades", valor: ["Vieja, corregida"] }], validez, VALIDADOR_LIBRE, quien);
    expect(r.ok && r.estado.contenido.fechasDeLasParticularidades).toEqual({ [claveDeItemDeLista("particularidades", "Vieja, corregida")]: "2026-11-22" });
  });

  it("la que se quita olvida su fecha; un cambio sin particularidades no inventa fechas", () => {
    const k = claveDeItemDeLista("particularidades", "Nueva");
    const r = aplicarOperaciones(estado(["Vieja", "Nueva"], { [k]: "2026-11-20" }), [{ op: "casilla", clave: "particularidades", valor: ["Vieja"] }], validez, VALIDADOR_LIBRE, quien);
    expect(r.ok && r.estado.contenido.fechasDeLasParticularidades).toBeUndefined();
    const otra = aplicarOperaciones(estado(["Vieja"]), [{ op: "casilla", clave: "planes", valor: ["Algo"] }], validez, VALIDADOR_LIBRE, quien);
    expect(otra.ok && otra.estado.contenido.fechasDeLasParticularidades).toBeUndefined();
  });
});

describe("lo guardado de antes", () => {
  it("las tarjetas compactas retiradas ya no se leen (se caen solas); las fechas sí, y solo las que tienen forma de día", () => {
    const leido = leerContenido({ casillas: { planes: ["a"] }, tarjetasCompactas: { planes: { huella: "abc", lineas: ["a"], en: "x" } } });
    expect("tarjetasCompactas" in leido).toBe(false);
    expect(leido.casillas.planes).toEqual(["a"]);
    expect(leerContenido({ fechasDeLasParticularidades: { x: "2026-11-22", y: "ayer" } }).fechasDeLasParticularidades).toEqual({ x: "2026-11-22" });
  });
});
