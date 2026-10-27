/**
 * lib/escala/preparacion.test.ts — la lectura «Preparación para engagement avanzado» (N6), estado por estado.
 * Con una escala chica escrita aquí; la de verdad (el borrador 9.0.0) se prueba en lib/escala/nueve/nueve.test.ts.
 */
import { describe, expect, it } from "vitest";
import { CATALOGO_DE_DATOS } from "@/lib/clients/datos-de-la-empresa";
import type { Criterio, Escala } from "./documento/tipos";
import { cumpleElCimiento, leerPreparacion as leer, preparacionDeLaVista, RANGOS_DE_BASE, RANGOS_DE_TRAFICO, rangoCumple, type EntradaDeLaPreparacion } from "./preparacion";

const SIN_PERFIL = { cierre: null, despues: null };
/** La lectura de la escala chica, con el perfil de la empresa. */
const leerPreparacion = (escala: typeof ESCALA, e: EntradaDeLaPreparacion) => {
  const vista = preparacionDeLaVista(escala, { cierre: null, despues: e.despues });
  return vista ? leer(vista, e) : null;
};

const criterio = (id: string, texto: string, extra: Partial<Criterio> = {}): Criterio => ({
  id,
  texto,
  verificacion: "comprobable",
  riesgo: false,
  habito: false,
  perfil: null,
  requiere: [],
  ...extra,
});

const ESCALA = {
  niveles: [
    { letra: "D", codigo: 1, nombre: "Deficiente" },
    { letra: "I", codigo: 2, nombre: "Inicial" },
    { letra: "F", codigo: 3, nombre: "Funcional" },
    { letra: "E", codigo: 4, nombre: "Eficiente" },
    { letra: "O", codigo: 5, nombre: "Óptimo" },
  ],
  areas: [
    {
      id: "2",
      nombre: "Marketing",
      dimensiones: [
        {
          id: "2.3",
          niveles: [
            { letra: "F", criterios: [criterio("2.3.F9", "El permiso por canal.", { riesgo: true })] },
            { letra: "E", criterios: [criterio("2.3.E7", "Lo que hace en el sitio, en su ficha.")] },
          ],
        },
      ],
    },
  ],
  preparacion: {
    umbralDeTrafico: 50_000,
    umbralDeBase: 5_000,
    // 1.2.F501 es de otra edición: en esta vista no existe y no cuenta.
    cimientos: ["2.3.F9", "2.3.E7", "1.2.F501"],
    estados: { lista: "Lo pide todo.", casiLista: "Le faltan cimientos.", todaviaNo: "Su camino es otro." },
  },
} as unknown as Pick<Escala, "preparacion" | "areas" | "niveles">;

const LISTA: EntradaDeLaPreparacion = {
  aQuienVende: "personas",
  despues: "recompra",
  trafico: "50k_200k",
  base: "10k_50k",
  nivelDeMarketing: "F",
  cimientos: { "2.3.F9": true, "2.3.E7": true },
};

describe("leerPreparacion", () => {
  it("una versión sin la lectura no da ninguna", () => {
    expect(preparacionDeLaVista({ ...ESCALA, preparacion: null }, SIN_PERFIL)).toBeNull();
  });

  it("la vista lleva los cimientos que existen en ella, con su dimensión y su nivel", () => {
    expect(preparacionDeLaVista(ESCALA, SIN_PERFIL)?.cimientos).toEqual([
      { id: "2.3.F9", texto: "El permiso por canal.", dimension: "2.3", letra: "F", riesgo: true },
      { id: "2.3.E7", texto: "Lo que hace en el sitio, en su ficha.", dimension: "2.3", letra: "E", riesgo: false },
    ]);
  });

  it("«Lista» cuando cumple todo, con lo que dice la escala; el cimiento de otra edición no cuenta", () => {
    const r = leerPreparacion(ESCALA, LISTA)!;
    expect(r.estado).toBe("lista");
    expect(r.queDiceLaEscala).toBe("Lo pide todo.");
    expect(r.cimientos.map((c) => c.id)).toEqual(["2.3.F9", "2.3.E7"]);
    expect(r.noCumple).toEqual([]);
    expect(r.faltaSaber).toEqual([]);
  });

  it("«Casi lista» dice qué cimiento falta; uno sin marcar no la vuelve «Lista»", () => {
    const r = leerPreparacion(ESCALA, { ...LISTA, cimientos: { "2.3.F9": false } })!;
    expect(r.estado).toBe("casi-lista");
    expect(r.cimientos).toEqual([
      { id: "2.3.F9", texto: "El permiso por canal.", cumple: false },
      { id: "2.3.E7", texto: "Lo que hace en el sitio, en su ficha.", cumple: null },
    ]);
    expect(leerPreparacion(ESCALA, { ...LISTA, cimientos: { "2.3.F9": true } })!.estado).toBe("falta-saber");
  });

  it("«Todavía no» por el perfil, el tráfico, la base o Marketing, aunque cumpla los cimientos", () => {
    expect(leerPreparacion(ESCALA, { ...LISTA, aQuienVende: "empresas" })!.estado).toBe("todavia-no");
    expect(leerPreparacion(ESCALA, { ...LISTA, despues: "única" })!.estado).toBe("todavia-no");
    const trafico = leerPreparacion(ESCALA, { ...LISTA, trafico: "10k_50k" })!;
    expect(trafico.estado).toBe("todavia-no");
    expect(trafico.noCumple).toEqual(["Tiene poco tráfico: de 10 mil a 50 mil visitas al mes, y la lectura pide 50.000 o más."]);
    expect(leerPreparacion(ESCALA, { ...LISTA, base: "menos_1k" })!.estado).toBe("todavia-no");
    const mkt = leerPreparacion(ESCALA, { ...LISTA, nivelDeMarketing: "I" })!;
    expect(mkt.estado).toBe("todavia-no");
    expect(mkt.noCumple).toEqual(["Marketing está en Inicial: la lectura pide Funcional o más."]);
    expect(mkt.queDiceLaEscala).toBe("Su camino es otro.");
  });

  it("no adivina: lo que falta lo dice, y un rango que contiene el umbral queda por confirmar", () => {
    const vacio = leerPreparacion(ESCALA, { aQuienVende: null, despues: null, trafico: null, base: null, nivelDeMarketing: null, cimientos: {} })!;
    expect(vacio.estado).toBe("falta-saber");
    expect(vacio.faltaSaber).toHaveLength(5);
    const base = leerPreparacion(ESCALA, { ...LISTA, base: "1k_10k" })!;
    expect(base.estado).toBe("falta-saber");
    expect(base.faltaSaber).toEqual(["Si la base con permiso para recibir mensajes llega a 5.000 contactos: hoy dice «de mil a 10 mil contactos»."]);
    // Lo que no cumple pesa más que lo que falta saber.
    expect(leerPreparacion(ESCALA, { ...LISTA, base: "1k_10k", aQuienVende: "empresas" })!.estado).toBe("todavia-no");
  });

  it("un cimiento sin marca: el nivel confirmado de su dimensión lo da por cumplido, salvo que sea de riesgo", () => {
    const F = { letra: "F" as const, riesgo: false };
    const E = { letra: "E" as const, riesgo: false };
    const riesgo = { letra: "F" as const, riesgo: true };
    // Lo marcado manda, en los dos sentidos.
    expect(cumpleElCimiento(E, "tiene", "I")).toBe(true);
    expect(cumpleElCimiento(F, "no_tiene", "O")).toBe(false);
    // Sin marca: la dimensión en ese nivel o más arriba lo cumple; más abajo, o sin nivel, no se sabe.
    expect(cumpleElCimiento(E, null, "E")).toBe(true);
    expect(cumpleElCimiento(E, undefined, "O")).toBe(true);
    expect(cumpleElCimiento(E, null, "F")).toBeNull();
    expect(cumpleElCimiento(F, "no_se", null)).toBeNull();
    // El de riesgo no decide el nivel: aunque la dimensión esté en Óptimo, sin marca no se sabe.
    expect(cumpleElCimiento(riesgo, null, "O")).toBeNull();
    expect(cumpleElCimiento(riesgo, "tiene", null)).toBe(true);
  });

  it("un rango cumple si empieza en el umbral, no cumple si termina en él, y si lo contiene no se sabe", () => {
    expect(rangoCumple(RANGOS_DE_TRAFICO["50k_200k"], 50_000)).toBe(true);
    expect(rangoCumple(RANGOS_DE_TRAFICO["10k_50k"], 50_000)).toBe(false);
    expect(rangoCumple(RANGOS_DE_BASE["1k_10k"], 5_000)).toBeNull();
    expect(rangoCumple(RANGOS_DE_BASE["mas_200k"], 5_000)).toBe(true);
  });

  it("los rangos son los mismos de los datos de la empresa (y de HubSpot): mismas claves, mismas palabras", () => {
    const opciones = (clave: string) => CATALOGO_DE_DATOS.find((d) => d.clave === clave)?.opciones ?? [];
    for (const [clave, rangos] of [
      ["trafico", RANGOS_DE_TRAFICO],
      ["baseConsentimiento", RANGOS_DE_BASE],
    ] as const) {
      const ops = opciones(clave);
      expect(Object.keys(rangos), clave).toEqual(ops.map((o) => o.valor));
      for (const o of ops) expect(rangos[o.valor].etiqueta, o.valor).toBe(o.etiqueta.toLowerCase());
    }
  });
});
