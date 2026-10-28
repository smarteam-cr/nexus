/**
 * lib/escala/radar.test.ts — la vista «Radar»: la geometría que comparte con el mapa (lib/escala/rueda.ts: de un nivel o
 * un puntaje a su anillo, el eje de cada dimensión, los rótulos en el mismo lugar), dónde se concentra cada serie, el
 * radar de UNA empresa (la página pública del test) y que la vista esté registrada en el selector y en la URL.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./documento/archivos";
import { MINI_ESCALA } from "./documento/mini-escala.fixture";
import { parsearEscala } from "./documento/parsear";
import { ejesDelRadar, nivelConMas, nivelMasCercano, nombreDelPromedio, SERIES_DE_ENTRADA, SERIES_DEL_RADAR, seriesDisponibles } from "./radar";
import {
  ANCHO,
  CX,
  CY,
  H,
  W,
  MITAD,
  polar,
  porciones,
  posicionDelPromedio,
  posicionDelPuntaje,
  puntosDeUnaEmpresa,
  R_BASE,
  R_DENTRO,
  R_FUERA,
  radioEnAnillos,
  rotuloDeCapa,
  rotuloDeDimension,
  lineaDeLaSerie,
  type DimensionDeUnaEmpresa,
} from "./rueda";
import { CIERRES, dimensionAplica } from "./documento/perfil";
import { LETRAS } from "./documento/tipos";
import { consultaDeLaEscala, requeridosDelArea, VISTAS, vistaDesdeUrl } from "./vista";

const mini = parsearEscala(MINI_ESCALA);
const real = parsearEscala(leerArchivoDeLaEscala("escala"));
const area = mini.areas[0];
const req = requeridosDelArea(mini, area);
const SIN_PERFIL = { cierre: null, despues: null };

/** La distancia de un punto al centro de la rueda. */
const radio = (p: { x: number; y: number }) => Math.hypot(p.x - CX, p.y - CY);
/** En qué anillo cae un radio (0 = Deficiente … 4 = Óptimo). */
const anilloDe = (r: number) => Math.floor((r - R_DENTRO) / ANCHO);

describe("geometría de la rueda (la del mapa, la del radar y la de una empresa)", () => {
  it("un nivel entero cae en el medio de su anillo; un promedio, entre los medios", () => {
    expect(radioEnAnillos(posicionDelPromedio(1))).toBe(R_DENTRO + ANCHO / 2);
    expect(radioEnAnillos(posicionDelPromedio(3))).toBe(R_DENTRO + ANCHO * 2.5);
    expect(radioEnAnillos(posicionDelPromedio(5))).toBe(R_FUERA - ANCHO / 2);
    expect(radioEnAnillos(posicionDelPromedio(3.5))).toBe(R_DENTRO + ANCHO * 3);
    // Funcional queda por fuera de la línea de la base (el borde de adentro de Funcional), como en el mapa.
    expect(radioEnAnillos(posicionDelPromedio(3))).toBeGreaterThan(R_BASE);
    expect(radioEnAnillos(posicionDelPromedio(2))).toBeLessThan(R_BASE);
  });

  it("un valor fuera de la escala no se sale de la rueda", () => {
    expect(radioEnAnillos(posicionDelPromedio(9))).toBe(R_FUERA - ANCHO / 2);
    expect(radioEnAnillos(posicionDelPromedio(-1))).toBe(R_DENTRO + ANCHO / 2);
    expect(radioEnAnillos(-3)).toBe(R_DENTRO);
    expect(radioEnAnillos(12)).toBe(R_FUERA);
  });

  it("de ángulo y radio a coordenadas: 0° arriba, 90° a la derecha, 180° abajo", () => {
    const cerca = (p: [number, number]) => p.map((v) => Math.round(v * 1000) / 1000);
    expect(cerca(polar(0, 50))).toEqual([CX, CY - 50]);
    expect(cerca(polar(90, 50))).toEqual([CX + 50, CY]);
    expect(cerca(polar(180, 50))).toEqual([CX, CY + 50]);
    expect(cerca(polar(270, 50))).toEqual([CX - 50, CY]);
  });

  it("la base va a la derecha y la producción a la izquierda, cada dimensión dentro de la mitad de su capa", () => {
    const ventas = real.areas[0];
    const angulos = porciones(ventas.dimensiones);
    for (const d of ventas.dimensiones) {
      const [g0, g1] = angulos.get(d.id)!;
      const [m0, m1] = MITAD[d.capa];
      expect(g0).toBeGreaterThanOrEqual(m0);
      expect(g1).toBeLessThanOrEqual(m1);
    }
    // En el orden de la escala, en el sentido de las agujas.
    const base = ventas.dimensiones.filter((d) => d.capa === "base").map((d) => angulos.get(d.id)![0]);
    expect([...base].sort((a, b) => a - b)).toEqual(base);
  });

  it("los rótulos no se salen del dibujo ni se pisan entre sí", () => {
    for (const a of real.areas) {
      const angulos = porciones(a.dimensiones);
      const rotulos = a.dimensiones.map((d) => rotuloDeDimension((angulos.get(d.id)![0] + angulos.get(d.id)![1]) / 2, d.nombre));
      for (const r of rotulos) {
        expect(r.yNumero).toBeGreaterThan(20);
        expect(r.yNota).toBeLessThan(H - 5);
        // Ni por el ancho: a 18 y en negrita, cada letra mide ~9,2 (medido: «Tecnología y Automatización», 248).
        for (const { texto } of r.nombre) {
          const ancho = texto.length * 9.6;
          const [x0, x1] = r.ancla === "start" ? [r.x, r.x + ancho] : r.ancla === "end" ? [r.x - ancho, r.x] : [r.x - ancho / 2, r.x + ancho / 2];
          expect(x0, texto).toBeGreaterThanOrEqual(0);
          expect(x1, texto).toBeLessThanOrEqual(W);
        }
      }
      // Dos rótulos del mismo costado están a más de dos renglones de distancia.
      for (const lado of ["start", "end"] as const) {
        const ys = rotulos
          .filter((r) => r.ancla === lado)
          .map((r) => r.yNumero)
          .sort((x, y) => x - y);
        for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThan(40);
      }
    }
    const base = rotuloDeCapa("base", "Base operativa", "cómo está montado el departamento por dentro");
    expect(base.ancla).toBe("start");
    expect(base.nombre.map((l) => l.texto)).toEqual(["BASE", "OPERATIVA"]);
    expect(rotuloDeCapa("produccion", "Producción", null).ancla).toBe("end");
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

describe("el radar de una empresa", () => {
  const VENTAS: DimensionDeUnaEmpresa[] = [
    { clave: "1.1", numero: "1.1", nombre: "Procesos y Rutinas", capa: "base", puntaje: 28, nivel: "I" },
    { clave: "1.2", numero: "1.2", nombre: "Tecnología y Automatización", capa: "base", puntaje: 8, nivel: "D" },
    { clave: "1.3", numero: "1.3", nombre: "Datos", capa: "base", puntaje: 55, nivel: "F" },
    { clave: "1.4", numero: "1.4", nombre: "Equipo y Gobierno", capa: "base", puntaje: 70, nivel: "E" },
    { clave: "1.5", numero: "1.5", nombre: "Propuesta y Coherencia", capa: "produccion", puntaje: 100, nivel: "O" },
    { clave: "1.6", numero: "1.6", nombre: "Priorización de Leads", capa: "produccion", puntaje: null, nivel: null },
    { clave: "1.7", numero: "1.7", nombre: "Tracción del Negocio", capa: "produccion", puntaje: 20, nivel: "I" },
    { clave: "1.8", numero: "1.8", nombre: "Aprendizaje de Ganadas y Perdidas", capa: "produccion", puntaje: 0, nivel: "D" },
  ];

  it("cada punto cae en el anillo de SU nivel, más afuera cuanto más avanzó dentro de él", () => {
    const puntos = puntosDeUnaEmpresa(VENTAS);
    VENTAS.forEach((d, i) => {
      if (!d.nivel) return;
      expect(anilloDe(radio(puntos[i]!)), d.nombre).toBe(LETRAS.indexOf(d.nivel));
    });
    // 28 y 20 son los dos Inicial: 28 avanzó más.
    expect(radio(puntos[0]!)).toBeGreaterThan(radio(puntos[6]!));
  });

  it("el nivel manda: un puntaje que no calza con su nivel no saca el punto de su anillo", () => {
    expect(posicionDelPuntaje(90, "I")).toBeLessThan(2);
    expect(posicionDelPuntaje(90, "I")).toBeGreaterThan(1);
    expect(posicionDelPuntaje(5, "E")).toBeGreaterThan(3);
    expect(posicionDelPuntaje(Number.NaN, "F")).toBeCloseTo(2.5);
    // Óptimo es un solo puntaje (100): al medio de su anillo.
    expect(posicionDelPuntaje(100, "O")).toBe(4.5);
  });

  it("los extremos de un tramo quedan lejos de la raya entre anillos", () => {
    for (const nivel of ["D", "I", "F", "E"] as const) {
      const k = LETRAS.indexOf(nivel);
      expect(posicionDelPuntaje(20 * k, nivel) - k).toBeGreaterThanOrEqual(0.15 - 1e-9);
      expect(k + 1 - posicionDelPuntaje(20 * k + 19, nivel)).toBeGreaterThanOrEqual(0.15 - 1e-9);
    }
  });

  /** Los ejes de la línea de una empresa, como los arma el componente. */
  const ejesDe = (dims: DimensionDeUnaEmpresa[]) => puntosDeUnaEmpresa(dims).map((p, i) => ({ medio: p?.medio ?? -1, capa: dims[i].capa, punto: p }));

  it("sin nivel no hay punto, y la línea se corta en ese eje", () => {
    const puntos = puntosDeUnaEmpresa(VENTAS);
    expect(puntos[5]).toBeNull();
    // El eje sin punto conserva su lugar en la rueda (entre 1.5 y 1.7): sus dos lados no se dibujan.
    const angulos = porciones(VENTAS.map((d) => ({ id: d.clave, capa: d.capa })));
    const ejes = VENTAS.map((d, i) => ({ medio: (angulos.get(d.clave)![0] + angulos.get(d.clave)![1]) / 2, capa: d.capa, punto: puntos[i] }));
    const { lados, relleno } = lineaDeLaSerie(ejes);
    expect(relleno).toBeNull();
    expect(lados).toHaveLength(6);
  });

  it("con todo contestado, un polígono cerrado; cada punto en la mitad de su capa", () => {
    const todas = VENTAS.map((d) => (d.nivel ? d : { ...d, puntaje: 50, nivel: "F" as const }));
    const puntos = puntosDeUnaEmpresa(todas);
    const { lados, relleno } = lineaDeLaSerie(ejesDe(todas));
    expect(relleno).toEqual(puntos);
    // Dos lados cruzan el hueco: arriba y abajo, entre la base y la producción.
    expect(lados.filter((l) => l.cruzaElHueco)).toHaveLength(2);
    todas.forEach((d, i) => {
      if (d.capa === "base") expect(puntos[i]!.x).toBeGreaterThan(CX);
      else expect(puntos[i]!.x).toBeLessThan(CX);
    });
  });

  it("los ejes son los mismos que los del mapa de la escala", () => {
    const ventas = real.areas[0];
    const empresa = ventas.dimensiones.map((d) => ({ clave: d.id, numero: d.id, nombre: d.nombre, capa: d.capa, puntaje: 50, nivel: "F" as const }));
    const angulos = porciones(ventas.dimensiones);
    puntosDeUnaEmpresa(empresa).forEach((p, i) => {
      const [g0, g1] = angulos.get(ventas.dimensiones[i].id)!;
      expect(p!.medio).toBeCloseTo((g0 + g1) / 2);
    });
  });
});

describe("lineaDeLaSerie: por dónde va la línea", () => {
  /** Cuatro ejes como en la rueda: dos de la base (derecha) y dos de la producción (izquierda), desordenados. */
  const eje = (medio: number, punto: string | null) => ({ medio, capa: medio < 180 ? ("base" as const) : ("produccion" as const), punto });

  it("con todos los puntos, cada uno unido con su vecino en el sentido de las agujas, y relleno", () => {
    const { lados, relleno } = lineaDeLaSerie([eje(300, "d"), eje(40, "a"), eje(140, "b"), eje(220, "c")]);
    expect(relleno).toEqual(["a", "b", "c", "d"]);
    expect(lados.map((l) => `${l.de}${l.a}`)).toEqual(["ab", "bc", "cd", "da"]);
  });

  it("los lados que unen las dos mitades cruzan el hueco (se dibujan tenues); los de adentro, no", () => {
    const { lados } = lineaDeLaSerie([eje(40, "a"), eje(140, "b"), eje(220, "c"), eje(300, "d")]);
    expect(lados.filter((l) => l.cruzaElHueco).map((l) => `${l.de}${l.a}`)).toEqual(["bc", "da"]);
  });

  it("con todas las dimensiones en una sola capa, el lado que cierra la vuelta igual cruza el hueco", () => {
    const base = (medio: number, punto: string) => ({ medio, capa: "base" as const, punto });
    const { lados } = lineaDeLaSerie([base(30, "a"), base(90, "b"), base(150, "c")]);
    expect(lados.filter((l) => l.cruzaElHueco).map((l) => `${l.de}${l.a}`)).toEqual(["ca"]);
  });

  it("un eje sin punto corta la línea y se queda sin relleno", () => {
    const { lados, relleno } = lineaDeLaSerie([eje(40, "a"), eje(140, null), eje(220, "c"), eje(300, "d")]);
    expect(relleno).toBeNull();
    expect(lados.map((l) => `${l.de}${l.a}`)).toEqual(["cd", "da"]);
  });

  it("un punto sin vecinos no lleva línea; con dos ejes, un solo lado", () => {
    expect(lineaDeLaSerie([eje(40, "a"), eje(140, null), eje(220, "c"), eje(300, null)]).lados).toEqual([]);
    expect(lineaDeLaSerie([eje(40, "a"), eje(220, "c")]).lados).toHaveLength(1);
    expect(lineaDeLaSerie([eje(40, "a")]).lados).toEqual([]);
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
