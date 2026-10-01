/**
 * lib/exploraciones/guion-y-calidad.test.ts — el guion de las dos reuniones, la industria sugerida y
 * «lista para proponer».
 */
import { describe, expect, it } from "vitest";
import { calcularChequeo, type AreaParaChequeo } from "@/lib/escala/chequeo";
import type { Letra } from "@/lib/escala/documento/tipos";
import { listaParaProponer, queSigue } from "./calidad";
import { contenidoVacio, propuestaVacia, type EstadoDeExploracion } from "./contenido";
import { aFecha, diaConAnio, diaCorto } from "./fechas";
import { industriaLegible, sugerirEdicion } from "./industria";
import { minutosPara, REUNIONES } from "./sesion";

describe("el guion", () => {
  it("cada reunión suma su duración de referencia", () => {
    for (const r of REUNIONES) expect(r.pasos.reduce((s, p) => s + p.minutos, 0), r.id).toBe(r.duracion);
  });

  it("la primera dura 30 y no tiene producto: el test prometió que no es una llamada de ventas", () => {
    const r1 = REUNIONES.find((r) => r.id === "revision")!;
    expect(r1.duracion).toBe(30);
    expect(r1.pasos.some((p) => p.llena.includes("producto"))).toBe(false);
  });

  it("el producto, en la segunda, es opcional y de cinco minutos como máximo", () => {
    const p = REUNIONES.find((r) => r.id === "fondo")!.pasos.find((x) => x.llena.includes("producto"))!;
    expect(p.opcional).toBe(true);
    expect(p.minutos).toBeLessThanOrEqual(5);
  });

  it("los ids de los pasos no se repiten (son la clave de la nota rápida)", () => {
    const ids = REUNIONES.flatMap((r) => r.pasos.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("con otra duración los minutos se ajustan en la misma proporción, nunca a cero", () => {
    const r1 = REUNIONES[0];
    expect(minutosPara(r1, 60)).toEqual(r1.pasos.map((p) => p.minutos * 2));
    expect(minutosPara(r1, 5).every((m) => m >= 1)).toBe(true);
  });
});

describe("la industria sugerida", () => {
  const todas = ["ecommerce-retail", "banca", "educacion", "inmobiliaria"];

  it("los códigos de HubSpot, viejos y nuevos, y la etiqueta en español del test", () => {
    expect(sugerirEdicion("RETAIL", todas)).toBe("ecommerce-retail");
    expect(sugerirEdicion("BANKING_MORTGAGE", todas)).toBe("banca");
    expect(sugerirEdicion("FINANCIAL_SERVICES", todas)).toBe("banca");
    expect(sugerirEdicion("HIGHER_EDUCATION_ACADEMIA", todas)).toBe("educacion");
    expect(sugerirEdicion("COMMERCIAL_REAL_ESTATE", todas)).toBe("inmobiliaria");
    expect(sugerirEdicion("Bienes raíces", todas)).toBe("inmobiliaria");
    expect(sugerirEdicion("Educación", todas)).toBe("educacion");
  });

  it("el software es software: escala general", () => {
    expect(sugerirEdicion("COMPUTER_SOFTWARE", todas)).toBeNull();
    expect(sugerirEdicion("COMPUTER_SOFTWARE_ENGINEERING", todas)).toBeNull();
  });

  it("solo sugiere ediciones que la escala publicada trae", () => {
    expect(sugerirEdicion("RETAIL", ["banca"])).toBeNull();
  });

  it("el código se lee como texto", () => {
    expect(industriaLegible("COMPUTER_SOFTWARE")).toBe("Computer software");
    expect(industriaLegible("Banca")).toBe("Banca");
  });
});

function area(): AreaParaChequeo {
  return {
    id: "1",
    nombre: "Ventas",
    dimensiones: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      id: `1.${n}`,
      nombre: `D${n}`,
      capa: n <= 4 ? ("base" as const) : ("produccion" as const),
      aplica: true,
    })),
    orden: { base: null, produccion: null },
  };
}

const chequeoCon = (letras: string) =>
  calcularChequeo(
    [area()],
    Object.fromEntries([...letras].map((l, i) => [`1.${i + 1}`, { nivel: l as Letra }])),
  );

function estado(parcial: Partial<EstadoDeExploracion> = {}): EstadoDeExploracion {
  return {
    contenido: contenidoVacio(),
    propuesta: propuestaVacia(),
    areas: ["1"],
    edicion: null,
    perfilCierre: "con equipo",
    perfilDespues: "continua",
    responsableEmail: null,
    archivada: false,
    ...parcial,
  };
}

describe("lista para proponer", () => {
  it("vacía: ninguno de los siete, salvo lo no explorado (no hay nada pendiente)", () => {
    const puntos = listaParaProponer(estado(), chequeoCon("FFFIIIII".slice(0, 7)));
    expect(puntos).toHaveLength(7);
    expect(puntos.filter((p) => p.cumplido).map((p) => p.id)).toEqual(["noExplorado"]);
  });

  it("completa: los siete", () => {
    const e = estado({
      contenido: {
        ...contenidoVacio(),
        sinPortal: true,
        casillas: {
          metas: [{ que: "Cerrar más", objetivo: "7 de cada 10" }],
          autoridad: [
            { nombre: "Ana", rol: "firma" },
            { nombre: "Luis", rol: "afectado" },
          ],
          consecuencias: ["Siguen perdiendo 3 de cada 10"],
          siguientePaso: { que: "Presentar la propuesta", fecha: "2026-10-08" },
        },
      },
    });
    expect(listaParaProponer(e, chequeoCon("FFFIIIII")).every((p) => p.cumplido)).toBe(true);
    expect(queSigue(e, chequeoCon("FFFIIIII"))).toMatch(/Lista para proponer/);
  });

  it("una meta sin número no cuenta como «en cifras»", () => {
    const e = estado({ contenido: { ...contenidoVacio(), casillas: { metas: [{ que: "Vender más" }] } } });
    expect(listaParaProponer(e, chequeoCon("FFFFFFFF")).find((p) => p.id === "meta")!.cumplido).toBe(false);
  });

  it("qué sigue va en el orden del proceso: perfil, áreas, lo propuesto, las dimensiones, la meta", () => {
    expect(queSigue(estado({ perfilCierre: null }), chequeoCon("FFFFFFFF"))).toMatch(/perfil/);
    expect(queSigue(estado({ areas: [] }), chequeoCon("FFFFFFFF"))).toMatch(/áreas/);
    expect(queSigue(estado(), chequeoCon("FFFFFFF"))).toMatch(/dimensión que falta/);
    expect(queSigue(estado(), chequeoCon("FFFFFFFF"))).toMatch(/meta en cifras/);
  });
});

describe("fechas en la hora de Costa Rica", () => {
  it("una fecha sin hora es ese día, no el anterior (la medianoche UTC ya es el día de antes en Costa Rica)", () => {
    expect(diaCorto("2026-09-26")).toMatch(/^26 sept/);
    expect(aFecha("2026-09-26").toISOString()).toBe("2026-09-26T18:00:00.000Z");
  });

  it("una llamada de las 8 de la noche es de ese día aunque en UTC ya sea el siguiente", () => {
    // 2026-09-21T02:00Z = 20 de septiembre, 8 p. m. en Costa Rica.
    expect(diaConAnio(Date.parse("2026-09-21T02:00:00.000Z"))).toMatch(/^20 sept/);
  });
});
