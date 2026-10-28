/**
 * lib/escala/radar.test.ts — la vista «Radar»: la geometría (de nivel a radio y a coordenadas, el orden de los
 * ejes), dónde se concentra cada serie y que la vista esté registrada en el selector y en la URL.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./documento/archivos";
import { MINI_ESCALA } from "./documento/mini-escala.fixture";
import { parsearEscala } from "./documento/parsear";
import {
  aCoordenadas,
  anguloDelEje,
  ejesDelRadar,
  nivelConMas,
  nivelMasCercano,
  nombreDelPromedio,
  radioDelNivel,
  SERIES_DE_ENTRADA,
  SERIES_DEL_RADAR,
  seriesDisponibles,
  tramosDelRadar,
} from "./radar";
import { CIERRES, dimensionAplica } from "./documento/perfil";
import { consultaDeLaEscala, requeridosDelArea, VISTAS, vistaDesdeUrl } from "./vista";

const mini = parsearEscala(MINI_ESCALA);
const real = parsearEscala(leerArchivoDeLaEscala("escala"));
const area = mini.areas[0];
const req = requeridosDelArea(mini, area);
const SIN_PERFIL = { cierre: null, despues: null };

describe("geometría del radar", () => {
  it("cada nivel es un anillo a la misma distancia: Deficiente a 1/5 del radio, Óptimo en el borde", () => {
    expect(radioDelNivel(1, 200)).toBe(40);
    expect(radioDelNivel(3, 200)).toBe(120);
    expect(radioDelNivel(5, 200)).toBe(200);
    expect(radioDelNivel(2.5, 200)).toBe(100);
  });

  it("un valor fuera de la escala no se sale del dibujo", () => {
    expect(radioDelNivel(9, 200)).toBe(200);
    expect(radioDelNivel(-1, 200)).toBe(0);
  });

  it("los ejes se reparten parejo, el primero arriba y en el sentido de las agujas", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => anguloDelEje(i, 8))).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(anguloDelEje(1, 3)).toBe(120);
  });

  it("de ángulo y radio a coordenadas: 0° arriba, 90° a la derecha, 180° abajo", () => {
    const cerca = (p: [number, number]) => p.map((v) => Math.round(v * 1000) / 1000);
    expect(cerca(aCoordenadas(100, 100, 0, 50))).toEqual([100, 50]);
    expect(cerca(aCoordenadas(100, 100, 90, 50))).toEqual([150, 100]);
    expect(cerca(aCoordenadas(100, 100, 180, 50))).toEqual([100, 150]);
    expect(cerca(aCoordenadas(100, 100, 270, 50))).toEqual([50, 100]);
  });

  it("un promedio se nombra con el nivel más cercano", () => {
    expect(nivelMasCercano(1)).toBe("D");
    expect(nivelMasCercano(2.4)).toBe("I");
    expect(nivelMasCercano(2.5)).toBe("F");
    expect(nivelMasCercano(4.6)).toBe("O");
    expect(nivelMasCercano(0.2)).toBe("D");
  });

  it("un promedio entre dos anillos se dice «cerca de»: no hace creer que hay criterios en ese nivel", () => {
    const nombre = (l: string) => ({ D: "Deficiente", I: "Inicial", F: "Funcional", E: "Eficiente", O: "Óptimo" })[l] ?? l;
    expect(nombreDelPromedio(3, nombre)).toBe("Funcional");
    expect(nombreDelPromedio(3.1, nombre)).toBe("Funcional");
    expect(nombreDelPromedio(11 / 3, nombre)).toBe("cerca de Eficiente");
  });
});

describe("tramosDelRadar: por dónde va la línea", () => {
  it("con todos los puntos, un polígono cerrado", () => {
    expect(tramosDelRadar([1, 2, 3])).toEqual([{ cerrado: true, puntos: [1, 2, 3] }]);
  });

  it("un eje sin punto corta la línea, y el tramo que cruza el final queda entero", () => {
    expect(tramosDelRadar([1, 2, null, 4, 5])).toEqual([{ cerrado: false, puntos: [4, 5, 1, 2] }]);
    expect(tramosDelRadar([1, null, 3, 4, null, 6])).toEqual([
      { cerrado: false, puntos: [3, 4] },
      { cerrado: false, puntos: [6, 1] },
    ]);
  });

  it("un punto sin vecinos no lleva línea", () => {
    expect(tramosDelRadar([1, null, 3, null])).toEqual([]);
    expect(tramosDelRadar([null, null])).toEqual([]);
  });
});

describe("ejesDelRadar: dónde se concentra cada cosa", () => {
  it("un eje por dimensión, en el orden de la escala", () => {
    expect(ejesDelRadar(area, SIN_PERFIL, req).map((e) => e.dimensionId)).toEqual(area.dimensiones.map((d) => d.id));
  });

  it("el punto es el nivel promedio de sus criterios, con cuántos hay en cada nivel", () => {
    const [procesos] = ejesDelRadar(area, SIN_PERFIL, req);
    // 1.1: D1, I1, F1–F3, E1–E2, O1–O2 → (1 + 2 + 3·3 + 4·2 + 5·2) / 9.
    expect(procesos.series.criterios.cuantos).toBe(9);
    expect(procesos.series.criterios.valor).toBeCloseTo(30 / 9);
    expect(procesos.series.criterios.porNivel).toEqual({
      D: 1,
      I: 1,
      F: 3,
      E: 2,
      O: 2,
    });
    // Hábitos: F2 y E2. Riesgos: F3.
    expect(procesos.series.habitos.valor).toBe(3.5);
    expect(procesos.series.riesgos).toMatchObject({ valor: 3, cuantos: 1 });
  });

  it("sin criterios de una clase, la serie no tiene punto", () => {
    const [, traccion] = ejesDelRadar(area, SIN_PERFIL, req);
    expect(traccion.series.riesgos).toMatchObject({ valor: null, cuantos: 0 });
  });

  it("con el perfil cuentan solo los que aplican, y los escondidos van aparte", () => {
    const perfil = { cierre: "transaccional" as const, despues: null };
    const [procesos] = ejesDelRadar(area, perfil, req);
    expect(procesos.series.criterios.cuantos).toBe(8);
    expect(procesos.series.escondidos).toMatchObject({ valor: 3, cuantos: 1 });
    expect(ejesDelRadar(area, SIN_PERFIL, req)[0].series.escondidos.cuantos).toBe(0);
  });

  it("los escondidos por el perfil solo se ofrecen con un perfil elegido", () => {
    expect(seriesDisponibles(SIN_PERFIL)).not.toContain("escondidos");
    expect(seriesDisponibles({ cierre: "mixta", despues: null })).toContain("escondidos");
  });

  it("con la escala publicada, cada dimensión de cada área tiene su punto de criterios", () => {
    for (const a of real.areas) {
      const ejes = ejesDelRadar(a, SIN_PERFIL, requeridosDelArea(real, a));
      expect(ejes).toHaveLength(a.dimensiones.length);
      for (const e of ejes) expect(e.series.criterios.valor).not.toBeNull();
    }
  });
});

describe("ejesDelRadar con la escala publicada", () => {
  it("una dimensión que no aplica al perfil queda sin punto (salvo lo que el perfil esconde)", () => {
    let vistas = 0;
    for (const cierre of CIERRES) {
      const perfil = { cierre, despues: null };
      for (const a of real.areas) {
        const ejes = ejesDelRadar(a, perfil, requeridosDelArea(real, a));
        a.dimensiones.forEach((d, i) => {
          if (dimensionAplica(d, perfil)) return;
          vistas++;
          expect(ejes[i].aplica).toBe(false);
          for (const s of ["criterios", "habitos", "riesgos", "requeridos"] as const) expect(ejes[i].series[s].valor).toBeNull();
        });
      }
    }
    // Si la escala deja de tener una dimensión que no aplica a algún cierre, esta prueba ya no prueba nada.
    expect(vistas).toBeGreaterThan(0);
  });

  it("los requeridos son solo los criterios que otros requieren, no todos", () => {
    const ventas = real.areas[0];
    const ejes = ejesDelRadar(ventas, SIN_PERFIL, requeridosDelArea(real, ventas));
    const req = ejes.reduce((s, e) => s + e.series.requeridos.cuantos, 0);
    const todos = ejes.reduce((s, e) => s + e.series.criterios.cuantos, 0);
    expect(req).toBeGreaterThan(0);
    expect(req).toBeLessThan(todos);
  });

  it("las series de entrada dicen algo: su punto cambia de una dimensión a otra", () => {
    for (const a of real.areas) {
      const ejes = ejesDelRadar(a, SIN_PERFIL, requeridosDelArea(real, a));
      for (const s of SERIES_DE_ENTRADA) {
        const valores = new Set(ejes.map((e) => e.series[s].valor?.toFixed(2)).filter(Boolean));
        expect(valores.size, `${a.nombre} · ${s}`).toBeGreaterThan(1);
      }
    }
  });
});

describe("nivelConMas: el nivel que se describe en el panel", () => {
  it("es el que más criterios tiene, nunca uno vacío", () => {
    // Dos en Funcional y uno en Óptimo: el promedio (3,7) cae en Eficiente, pero ahí no hay ninguno.
    expect(nivelConMas({ valor: 11 / 3, cuantos: 3, porNivel: { D: 0, I: 0, F: 2, E: 0, O: 1 } })).toBe("F");
  });

  it("con un empate, el más cercano al promedio; sin criterios, ninguno", () => {
    expect(nivelConMas({ valor: 3.5, cuantos: 4, porNivel: { D: 0, I: 1, F: 0, E: 2, O: 1 } })).toBe("E");
    expect(nivelConMas({ valor: 2.5, cuantos: 2, porNivel: { D: 0, I: 1, F: 1, E: 0, O: 0 } })).toBe("I");
    expect(nivelConMas({ valor: null, cuantos: 0, porNivel: { D: 0, I: 0, F: 0, E: 0, O: 0 } })).toBeNull();
  });
});

describe("la vista Radar está registrada", () => {
  it("se ofrece en el selector, después de las otras tres", () => {
    expect(VISTAS).toEqual(["mapa", "matriz", "dimension", "radar"]);
  });

  it("viaja en la URL y vuelve de ella", () => {
    expect(
      consultaDeLaEscala({
        vista: "radar",
        perfil: SIN_PERFIL,
        industria: null,
        dimension: "1.1",
        celda: "1.1.F",
      }),
    ).toBe("?vista=radar");
    expect(vistaDesdeUrl("radar")).toBe("radar");
  });

  it("cada serie tiene su color fijo, en orden, y las de entrada existen", () => {
    expect(SERIES_DEL_RADAR.map((s) => s.color)).toEqual([
      "var(--color-serie-1)",
      "var(--color-serie-5)",
      "var(--color-serie-4)",
      "var(--color-fg)",
      "var(--color-fg-muted)",
    ]);
    // Ni el aqua ni el verde (se confundirían con la línea punteada de Funcional), ni el naranja (con el magenta y el amarillo).
    expect(SERIES_DEL_RADAR.some((s) => /serie-[236]/.test(s.color))).toBe(false);
    for (const s of SERIES_DE_ENTRADA) expect(SERIES_DEL_RADAR.some((x) => x.clave === s)).toBe(true);
  });
});
