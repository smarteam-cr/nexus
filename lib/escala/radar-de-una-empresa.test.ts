/**
 * lib/escala/radar-de-una-empresa.test.ts — el radar de UNA empresa (la página pública del resultado del test y su PDF):
 * cada vértice en el cruce de la etapa de su dimensión, lo no preguntado sin vértice, «No lo sé», lo que más frena con
 * su flecha al objetivo y que ningún rótulo pise a otro. Las medidas son las del diseño aprobado el 2026-10-29.
 */
import { describe, expect, it } from "vitest";
import { LETRAS, type Letra } from "./documento/tipos";
import {
  COMPACTO,
  dibujoDelRadar,
  GRANDE,
  PDF,
  polarDe,
  radioDeLaEtapa,
  renglonesParejos,
  seCruzan,
  type Caja,
  type DimensionDelRadar,
  type MedidasDelRadar,
} from "./radar-de-una-empresa";

/** Los nombres de las etapas (en la página salen de la escala publicada). */
const NOMBRES: Record<Letra, string> = { D: "Deficiente", I: "Inicial", F: "Funcional", E: "Eficiente", O: "Óptimo" };
const dibujar = (m: MedidasDelRadar, dims: readonly DimensionDelRadar[], o: Omit<Parameters<typeof dibujoDelRadar>[2], "nombreDeNivel"> = {}) =>
  dibujoDelRadar(m, dims, { ...o, nombreDeNivel: (l) => NOMBRES[l] });

/** El ejemplo real del diseño: Ventas, edición maquinaria. */
const VENTAS: DimensionDelRadar[] = [
  { clave: "1.1", nombre: "Procesos y Rutinas", capa: "base", preguntada: true, nivel: "I", puntaje: 30 },
  { clave: "1.2", nombre: "Tecnología y Automatización", capa: "base", preguntada: true, nivel: "F", puntaje: 50 },
  { clave: "1.3", nombre: "Datos", capa: "base", preguntada: true, nivel: "I", puntaje: 30 },
  { clave: "1.4", nombre: "Equipo y Gobierno", capa: "base", preguntada: true, nivel: "I", puntaje: 30 },
  { clave: "1.5", nombre: "Líneas de máquinas y cotización", capa: "produccion", preguntada: true, nivel: "I", puntaje: 30 },
  { clave: "1.6", nombre: "Priorización de interesados", capa: "produccion", preguntada: true, nivel: "D", puntaje: 10 },
  { clave: "1.7", nombre: "Seguimiento de demostraciones y cotizaciones", capa: "produccion", preguntada: true, nivel: "F", puntaje: 50 },
  { clave: "1.8", nombre: "Ventas ganadas y perdidas", capa: "produccion", preguntada: true, nivel: "D", puntaje: 10 },
];
const FRENA = { clave: "1.6", objetivo: "F" as Letra };
const CAPAS = [
  { clave: "base" as const, nombre: "Base operativa", descripcion: "cómo está montado el departamento por dentro" },
  { clave: "produccion" as const, nombre: "Producción", descripcion: "qué entrega el departamento hacia afuera" },
];

/** El test corto: solo la base, con un «No lo sé» que además es lo que más frena. */
const CORTO: DimensionDelRadar[] = VENTAS.map((d) =>
  d.capa === "produccion" ? { ...d, preguntada: false, nivel: null, puntaje: null } : d.clave === "1.3" ? { ...d, nivel: "D", noLoSe: true, puntaje: 10 } : d,
);

const distancia = (m: MedidasDelRadar, [x, y]: [number, number]) => Math.hypot(x - m.cx, y - m.cy);
const cerca = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 1);
  expect(a[1]).toBeCloseTo(b[1], 1);
};

describe("el radar de una empresa: la geometría del diseño", () => {
  it("los anillos y los vértices del ejemplo caen donde los dibujó el diseño (tablero Main)", () => {
    const d = dibujar(GRANDE, VENTAS, { frena: FRENA, capas: CAPAS });
    // El anillo de Deficiente y el de Óptimo, en el eje 1.1.
    cerca(d.anillos[0].puntos[0], [751.7, 285.3]);
    cerca(d.anillos[4].puntos[0], [822.1, 115.3]);
    // La figura: 1.1 en Inicial, 1.2 en Funcional… 1.8 en Deficiente.
    const fig = d.figura.map(([x, y]) => [Number(x.toFixed(1)), Number(y.toFixed(1))]);
    expect(fig).toEqual([
      [769.3, 242.8],
      [909.7, 323.1],
      [867.2, 479.3],
      [769.3, 577.2],
      [630.7, 577.2],
      [575.3, 461.7],
      [490.3, 323.1],
      [648.3, 285.3],
    ]);
    // Los nombres de las etapas y el chip de «La base».
    expect(d.etapas[0].y).toBeCloseTo(289.1, 1);
    expect(d.etapas[2].y).toBeCloseTo(204.1, 1);
    expect((d.chipDeLaBase.y0 + d.chipDeLaBase.y1) / 2).toBeCloseTo(619.7, 1);
  });

  it("cada vértice va EXACTO en el cruce de su eje con el anillo de su etapa, en las cinco etapas", () => {
    for (const m of [GRANDE, PDF, COMPACTO]) {
      LETRAS.forEach((letra, k) => {
        const dims = VENTAS.map((x) => ({ ...x, nivel: letra }));
        const d = dibujar(m, dims);
        expect(d.vertices).toHaveLength(8);
        for (const v of d.vertices) {
          expect(distancia(m, v.punto)).toBeCloseTo(m.rAnillo + m.paso * k, 6);
          expect(distancia(m, v.punto)).toBeCloseTo(radioDeLaEtapa(m, letra), 6);
          // Y sobre su eje: el mismo ángulo que la punta del eje.
          const eje = d.ejes.find((e) => e.clave === v.clave)!;
          cerca(v.punto, polarDe(m, eje.grados, radioDeLaEtapa(m, letra)));
        }
      });
    }
  });

  it("los ejes no quedan verticales: con cuatro por mitad, 22,5° + 45°·k, la base a la derecha", () => {
    const d = dibujar(GRANDE, VENTAS);
    expect(d.ejes.map((e) => e.grados)).toEqual([22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]);
  });

  it("una dimensión que no se preguntó: eje punteado, sin vértice, sin puntos grises, y la figura pasa por el centro", () => {
    const d = dibujar(GRANDE, CORTO, { capas: CAPAS });
    expect(d.ejes.filter((e) => !e.preguntada).map((e) => e.clave)).toEqual(["1.5", "1.6", "1.7", "1.8"]);
    expect(d.vertices.map((v) => v.clave)).toEqual(["1.1", "1.2", "1.3", "1.4"]);
    // La figura: los cuatro vértices de la base y UNA vez el centro por la racha de la producción.
    expect(d.figura).toHaveLength(5);
    expect(d.figura.filter(([x, y]) => x === GRANDE.cx && y === GRANDE.cy)).toHaveLength(1);
    // Ningún punto gris en los ejes sin preguntar.
    const angulosSinPreguntar = d.ejes.filter((e) => !e.preguntada).map((e) => e.grados);
    for (const p of d.puntosGrises) {
      const g = ((Math.atan2(p[0] - GRANDE.cx, GRANDE.cy - p[1]) * 180) / Math.PI + 360) % 360;
      expect(angulosSinPreguntar.some((a) => Math.abs(a - g) < 0.01)).toBe(false);
    }
    // El rótulo dice que no se preguntó.
    expect(d.rotulos.find((r) => r.clave === "1.6")!.estado).toEqual({ tipo: "noPreguntada" });
  });

  it("una racha sin preguntar que cruza el comienzo pasa por el centro una sola vez", () => {
    const dims = VENTAS.map((x) => (x.clave === "1.1" || x.clave === "1.8" ? { ...x, preguntada: false, nivel: null } : x));
    const d = dibujar(GRANDE, dims);
    expect(d.figura).toHaveLength(7);
    expect(d.figura.filter(([x, y]) => x === GRANDE.cx && y === GRANDE.cy)).toHaveLength(1);
  });

  it("sin nada preguntado no hay figura ni vértices", () => {
    const d = dibujar(GRANDE, VENTAS.map((x) => ({ ...x, preguntada: false, nivel: null })));
    expect(d.figura).toEqual([]);
    expect(d.vertices).toEqual([]);
  });

  it("«No lo sé»: el vértice va en Deficiente marcado, y el rótulo lleva la nota «cuenta como Deficiente»", () => {
    const d = dibujar(GRANDE, CORTO);
    const v = d.vertices.find((x) => x.clave === "1.3")!;
    expect(v.noLoSe).toBe(true);
    expect(distancia(GRANDE, v.punto)).toBeCloseTo(radioDeLaEtapa(GRANDE, "D"), 6);
    const r = d.rotulos.find((x) => x.clave === "1.3")!;
    expect(r.estado).toEqual({ tipo: "noLoSe" });
    expect(r.nota).not.toBeNull();
    expect(r.nota!.y).toBeGreaterThan(r.nombre[r.nombre.length - 1].y);
  });

  it("lo que más frena: halo en su vértice, el chip en su rótulo y una flecha que va hacia afuera hasta su objetivo", () => {
    const d = dibujar(GRANDE, VENTAS, { frena: FRENA });
    const v = d.vertices.find((x) => x.frena)!;
    expect(v.clave).toBe("1.6");
    expect(d.vertices.filter((x) => x.frena)).toHaveLength(1);
    expect(d.rotulos.filter((r) => r.chip).map((r) => r.clave)).toEqual(["1.6"]);
    const o = d.objetivo!;
    expect(o.nivel).toBe("F");
    expect(distancia(GRANDE, o.punto)).toBeCloseTo(radioDeLaEtapa(GRANDE, "F"), 6);
    // Las medidas del diseño: la línea de (562.3, 467) a (505.1, 490.7) y la punta en (501.4, 492.3).
    cerca(o.linea![0], [562.3, 467]);
    cerca(o.linea![1], [505.1, 490.7]);
    cerca(o.punta[0], [501.4, 492.3]);
    // La flecha sale del vértice y no llega a tapar el aro del objetivo.
    expect(distancia(GRANDE, o.linea![0])).toBeGreaterThan(distancia(GRANDE, v.punto));
    expect(distancia(GRANDE, o.punta[0])).toBeLessThan(distancia(GRANDE, o.punto) - GRANDE.objetivo.r);
    // El cruce del objetivo no lleva punto gris (lo tapa el aro).
    expect(d.puntosGrises.some((p) => Math.hypot(p[0] - o.punto[0], p[1] - o.punto[1]) < 0.01)).toBe(false);
  });

  it("en el teléfono, con el objetivo a una sola etapa, la punta de la flecha cabe entre el vértice y el aro del objetivo", () => {
    for (const [nivel, objetivo] of [
      ["I", "F"],
      ["F", "E"],
      ["D", "I"],
    ] as [Letra, Letra][]) {
      const dims = VENTAS.map((x) => (x.clave === "1.6" ? { ...x, nivel } : x));
      const d = dibujar(COMPACTO, dims, { frena: { clave: "1.6", objetivo } });
      const o = d.objetivo!;
      const rV = radioDeLaEtapa(COMPACTO, nivel);
      const rO = radioDeLaEtapa(COMPACTO, objetivo);
      // Sin línea al revés: o no va, o va hacia afuera.
      if (o.linea) expect(distancia(COMPACTO, o.linea[1])).toBeGreaterThan(distancia(COMPACTO, o.linea[0]));
      const punta = distancia(COMPACTO, o.punta[0]);
      const base = distancia(COMPACTO, [(o.punta[1][0] + o.punta[2][0]) / 2, (o.punta[1][1] + o.punta[2][1]) / 2]);
      expect(punta, `${nivel}→${objetivo}: la punta toca el aro`).toBeLessThanOrEqual(rO - COMPACTO.objetivo.r + 0.01);
      expect(base, `${nivel}→${objetivo}: la base entra al vértice`).toBeGreaterThanOrEqual(rV + COMPACTO.vertice.rFrena - 0.01);
      expect(punta - base, `${nivel}→${objetivo}: la punta se ve`).toBeGreaterThanOrEqual(3);
    }
  });

  it("el chip de lo que más frena va debajo del rótulo y, en uno de arriba, encima de su número (debajo colgaría dentro del radar)", () => {
    const arriba = dibujar(GRANDE, VENTAS, { frena: { clave: "1.1", objetivo: "F" } }).rotulos.find((r) => r.clave === "1.1")!;
    expect(arriba.chip!.y + GRANDE.rotulo!.chip.alto).toBeLessThan(arriba.yNumero - GRANDE.rotulo!.numero + 1);
    const costado = dibujar(GRANDE, VENTAS, { frena: FRENA }).rotulos.find((r) => r.clave === "1.6")!;
    expect(costado.chip!.y).toBeGreaterThan(costado.nombre[costado.nombre.length - 1].y);
    const abajo = dibujar(GRANDE, VENTAS, { frena: { clave: "1.4", objetivo: "F" } }).rotulos.find((r) => r.clave === "1.4")!;
    expect(abajo.chip!.y).toBeGreaterThan(abajo.nombre[abajo.nombre.length - 1].y);
  });

  it("un freno sobre una dimensión que no se preguntó no se dibuja", () => {
    const d = dibujar(GRANDE, CORTO, { frena: FRENA });
    expect(d.objetivo).toBeNull();
    expect(d.vertices.some((v) => v.frena)).toBe(false);
  });

  it("los rótulos de la pantalla caen donde los puso el diseño", () => {
    const d = dibujar(GRANDE, VENTAS, { frena: FRENA, capas: CAPAS });
    const r = (c: string) => d.rotulos.find((x) => x.clave === c)!;
    expect(r("1.1").x).toBeCloseTo(835.1, 0);
    expect(r("1.1").yNumero).toBeCloseTo(56.2, 0);
    expect(r("1.2").yNumero).toBeCloseTo(257.3, 0);
    expect(r("1.2").nombre.map((l) => l.texto)).toEqual(["Tecnología y", "Automatización"]);
    expect(r("1.3").yNumero).toBeCloseTo(537.5, 0);
    expect(r("1.4").yNumero).toBeCloseTo(750.6, 0);
    expect(r("1.5").nombre.map((l) => l.texto)).toEqual(["Líneas de máquinas", "y cotización"]);
    expect(r("1.6").chip!.y).toBeCloseTo(584.6, 0);
    expect(r("1.7").yNumero).toBeCloseTo(247.2, 0);
    expect(r("1.7").nombre.map((l) => l.texto)).toEqual(["Seguimiento de", "demostraciones y", "cotizaciones"]);
    expect(r("1.8").nombre.map((l) => l.texto)).toEqual(["Ventas ganadas", "y perdidas"]);
    expect(r("1.8").yNumero).toBeCloseTo(36.1, 0);
  });
});

describe("el radar de una empresa: ningún rótulo pisa a otro", () => {
  const LARGOS: DimensionDelRadar[] = [
    { clave: "4.1", nombre: "Procesos y Rutinas de Atención", capa: "base", preguntada: true, nivel: "O", puntaje: 100 },
    { clave: "4.2", nombre: "Tecnología, Automatización e Integraciones", capa: "base", preguntada: true, nivel: "E", puntaje: 70 },
    { clave: "4.3", nombre: "Datos y Reportes del Servicio", capa: "base", preguntada: true, nivel: "D", noLoSe: true, puntaje: 10 },
    { clave: "4.4", nombre: "Equipo, Roles y Gobierno", capa: "base", preguntada: true, nivel: "I", puntaje: 30 },
    { clave: "4.5", nombre: "Resolución en el primer contacto", capa: "produccion", preguntada: true, nivel: "D", puntaje: 10 },
    { clave: "4.6", nombre: "Experiencia y Satisfacción del Cliente", capa: "produccion", preguntada: false, nivel: null, puntaje: null },
    { clave: "4.7", nombre: "Retención, Renovaciones y Crecimiento de Cuentas", capa: "produccion", preguntada: true, nivel: "F", puntaje: 50 },
    { clave: "4.8", nombre: "Aprendizaje de Ganadas y Perdidas", capa: "produccion", preguntada: true, nivel: "D", puntaje: 10 },
  ];
  /** Tres, cinco y cuatro por mitad: los ejes cambian de ángulo y los rótulos de lado. */
  const DESPAREJO: DimensionDelRadar[] = [
    ...VENTAS.filter((d) => d.capa === "base").slice(0, 3),
    ...VENTAS.filter((d) => d.capa === "produccion"),
    { clave: "1.9", nombre: "Postventa y Referidos", capa: "produccion", preguntada: true, nivel: "E", puntaje: 70 },
  ];
  const casos: [string, DimensionDelRadar[], { clave: string; objetivo: Letra } | null][] = [
    ["el ejemplo del diseño", VENTAS, FRENA],
    ["lo que más frena arriba", VENTAS, { clave: "1.8", objetivo: "F" }],
    ["lo que más frena abajo", VENTAS, { clave: "1.4", objetivo: "E" }],
    ["el test corto con un «No lo sé»", CORTO, { clave: "1.3", objetivo: "F" }],
    ["nombres largos", LARGOS, { clave: "4.5", objetivo: "F" }],
    ["tres por un lado y cinco por el otro", DESPAREJO, { clave: "1.8", objetivo: "F" }],
  ];

  for (const [nombre, dims, frena] of casos) {
    for (const [cual, m] of [
      ["pantalla", GRANDE],
      ["PDF", PDF],
    ] as const) {
      it(`${nombre} (${cual})`, () => {
        const d = dibujar(m, dims, { frena, capas: CAPAS });
        const cajas: [string, Caja][] = [...d.rotulos.map((r) => [`rótulo ${r.clave}`, r.caja] as [string, Caja]), ...d.mitades.map((x) => [`mitad ${x.clave}`, x.caja] as [string, Caja])];
        for (let i = 0; i < cajas.length; i++) {
          for (let j = i + 1; j < cajas.length; j++) {
            expect(seCruzan(cajas[i][1], cajas[j][1]), `${cajas[i][0]} pisa ${cajas[j][0]}`).toBe(false);
          }
        }
        // Ningún rótulo entra al radar: no tapa la punta de ningún eje ni un vértice del anillo de afuera (Óptimo).
        const puntas = [...d.ejes.map((e) => e.hasta), ...d.anillos[4].puntos];
        for (const [quien, c] of cajas) {
          for (const [x, y] of puntas) {
            const adentro = x > c.x0 - 4 && x < c.x1 + 4 && y > c.y0 - 4 && y < c.y1 + 4;
            expect(adentro, `${quien} tapa el radar en (${x.toFixed(0)}, ${y.toFixed(0)})`).toBe(false);
          }
        }
        // Y todo queda dentro del dibujo; en el ejemplo del diseño, el dibujo es el del diseño.
        const [vx, vy, vw, vh] = d.caja;
        if (nombre === "el ejemplo del diseño") expect(d.caja).toEqual(m.caja);
        for (const [quien, c] of cajas) {
          expect(c.x0, `${quien} se sale por la izquierda`).toBeGreaterThanOrEqual(vx - 1);
          expect(c.x1, `${quien} se sale por la derecha`).toBeLessThanOrEqual(vx + vw + 1);
          expect(c.y0, `${quien} se sale por arriba`).toBeGreaterThanOrEqual(vy - 1);
          expect(c.y1, `${quien} se sale por abajo`).toBeLessThanOrEqual(vy + vh + 1);
        }
      });
    }
  }

  it("en el teléfono no hay rótulos: el número va en la punta de cada eje, sin pisarse", () => {
    const d = dibujar(COMPACTO, VENTAS, { frena: FRENA });
    expect(d.rotulos).toEqual([]);
    expect(d.numeros.map((n) => n.numero)).toEqual(VENTAS.map((x) => x.clave));
    for (let i = 0; i < d.numeros.length; i++) {
      for (let j = i + 1; j < d.numeros.length; j++) {
        const [a, b] = [d.numeros[i].punto, d.numeros[j].punto];
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(COMPACTO.numeroEnLaPunta!.r * 2);
      }
    }
    expect(d.numeros.find((n) => n.frena)!.clave).toBe("1.6");
  });
});

describe("los renglones de un nombre", () => {
  it("la menor cantidad de renglones y, entre esas, los más parejos", () => {
    expect(renglonesParejos("Datos", 18)).toEqual(["Datos"]);
    expect(renglonesParejos("Procesos y Rutinas", 18)).toEqual(["Procesos y Rutinas"]);
    expect(renglonesParejos("Ventas ganadas y perdidas", 18)).toEqual(["Ventas ganadas", "y perdidas"]);
    expect(renglonesParejos("Priorización de interesados", 18)).toEqual(["Priorización de", "interesados"]);
  });

  it("no pierde palabras y una palabra más larga que el renglón va sola", () => {
    const t = "Retención, Renovaciones y Crecimiento de Cuentas";
    expect(renglonesParejos(t, 18).join(" ")).toBe(t);
    expect(renglonesParejos("Superintercomunicaciones y más", 10)).toEqual(["Superintercomunicaciones", "y más"]);
    expect(renglonesParejos("", 18)).toEqual([]);
  });
});
