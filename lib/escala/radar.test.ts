/**
 * lib/escala/radar.test.ts — la vista «Radar», el radar de la teoría: qué cuenta cada cruce (lib/escala/radar.ts, la
 * misma cuenta del Mapa), su dibujo (lib/escala/radar-dibujo.ts: un eje por dimensión, un anillo por etapa, los rótulos
 * sin pisar cruces ni pisarse entre sí), la rueda del mapa que usa el radar de UNA empresa (lib/escala/rueda.ts) y que la
 * vista esté registrada en el selector y en la URL.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./documento/archivos";
import { MINI_ESCALA } from "./documento/mini-escala.fixture";
import { parsearEscala } from "./documento/parsear";
import { conPerfil, criteriosDelCruce, cuentaDeLaCelda, ejesDeLaTeoria, enPalabras, opcionesDeQueSeCuenta, QUE_SE_CUENTA, type QueSeCuenta } from "./radar";
import {
  ANCHO,
  CX,
  CY,
  H,
  W,
  MITAD,
  polar,
  porciones,
  posicionDelPuntaje,
  puntosDeUnaEmpresa,
  R_DENTRO,
  R_FUERA,
  radioEnAnillos,
  rotuloDeCapa,
  rotuloDeDimension,
  lineaDeLaSerie,
  type DimensionDeUnaEmpresa,
} from "./rueda";
import * as dibujo from "./radar-dibujo";
import { aplicarEdicion } from "./documento/edicion";
import { aplica, CIERRES, DESPUES, dimensionAplica, type Perfil } from "./documento/perfil";
import { enlacesQueAplican } from "./documento/requeridos";
import { LETRAS, type Criterio } from "./documento/tipos";
import { consultaDeLaEscala, requeridosDelArea, VISTAS, vistaDesdeUrl, type RequeridosDelArea } from "./vista";

const mini = parsearEscala(MINI_ESCALA);
const real = parsearEscala(leerArchivoDeLaEscala("escala"));
const area = mini.areas[0];
const req = requeridosDelArea(mini, area);
const SIN_PERFIL = { cierre: null, despues: null };

/** La distancia de un punto al centro de la rueda. */
const radio = (p: { x: number; y: number }) => Math.hypot(p.x - CX, p.y - CY);
/** En qué anillo cae un radio (0 = Deficiente … 4 = Óptimo). */
const anilloDe = (r: number) => Math.floor((r - R_DENTRO) / ANCHO);

/** Todos los perfiles que se pueden elegir con las dos primeras preguntas, más ninguno. */
const PERFILES: Perfil[] = [SIN_PERFIL, ...CIERRES.flatMap((cierre) => [null, ...DESPUES].map((despues) => ({ cierre, despues })))];
const QUES = QUE_SE_CUENTA.map((q) => q.clave);
/** Las áreas como se ven: la escala general y cada edición por industria (que renombra dimensiones). */
const AREAS_QUE_SE_VEN = [real, ...real.ediciones.map((e) => aplicarEdicion(real, e.slug))].flatMap((esc) =>
  esc.areas.map((a) => ({ ...a, nombre: `${a.nombre}${esc.edicion ? ` (${esc.edicion.nombre})` : ""}` })),
);

describe("geometría de la rueda (la del mapa y la de una empresa)", () => {
  it("un valor fuera de la escala no se sale de la rueda", () => {
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
});

describe("el dibujo del radar de la teoría: un eje por dimensión y un anillo por etapa", () => {
  it("con cuatro dimensiones por mitad, los ejes van a 22,5° + 45°·k: la base a la derecha, la producción a la izquierda", () => {
    const dims = ["base", "base", "base", "base", "produccion", "produccion", "produccion", "produccion"].map((capa, i) => ({
      id: `1.${i + 1}`,
      capa: capa as "base" | "produccion",
    }));
    const angulos = dibujo.angulosDeLosEjes(dims);
    expect(dims.map((d) => angulos.get(d.id))).toEqual([22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]);
  });

  it("en cada área publicada, ningún eje queda vertical y cada capa se queda en su mitad", () => {
    for (const a of real.areas) {
      const angulos = dibujo.angulosDeLosEjes(a.dimensiones);
      for (const d of a.dimensiones) {
        const g = angulos.get(d.id)!;
        expect(g % 180, d.id).not.toBe(0);
        if (d.capa === "base") expect(g).toBeLessThan(180);
        else expect(g).toBeGreaterThan(180);
      }
    }
  });

  it("los anillos son los del diseño: Deficiente adentro, Óptimo afuera, entre el centro y el final de los ejes", () => {
    expect(LETRAS.map((_, k) => dibujo.radioDeLaEtapa(k))).toEqual([110, 142.5, 175, 207.5, 240]);
    expect(dibujo.radioDeLaEtapa(0) - dibujo.CRUCE).toBeGreaterThan(dibujo.R_CENTRO);
    expect(dibujo.radioDeLaEtapa(LETRAS.length - 1)).toBeLessThan(dibujo.R_EJE_HASTA);
    // El cruce de 1.1 con Deficiente y con Óptimo, medidos en el diseño.
    const cerca = (p: [number, number]) => p.map((v) => Math.round(v * 10) / 10);
    expect(cerca(dibujo.cruce(22.5, 0))).toEqual([542.1, 278.4]);
    expect(cerca(dibujo.cruce(22.5, 4))).toEqual([591.8, 158.3]);
    expect(dibujo.anilloDeLaEtapa([22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5], 2)).toHaveLength(8);
  });

  it("los nombres de las etapas van arriba, de adentro hacia afuera, y «La base» abajo, sobre Funcional", () => {
    const angulos = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
    const ys = LETRAS.map((_, k) => dibujo.yEnElCentro(angulos, dibujo.radioDeLaEtapa(k), "arriba"));
    expect([...ys].sort((x, y) => y - x)).toEqual(ys);
    expect(ys[0]).toBeCloseTo(278.4, 1);
    expect(dibujo.yEnElCentro(angulos, dibujo.radioDeLaEtapa(2), "abajo")).toBeCloseTo(541.7, 1);
    // Con todas las dimensiones en una mitad no hay lado que cruce: el radio a secas.
    expect(dibujo.yEnElCentro([30, 90, 150], 50, "arriba")).toBe(dibujo.CY - 50);
  });

  it("el número de «qué se trabaja primero» va pasado el final del número de la dimensión, nunca hacia el radar", () => {
    for (const a of AREAS_QUE_SE_VEN) {
      const angulos = dibujo.angulosDeLosEjes(a.dimensiones);
      for (const d of a.dimensiones) {
        const r = dibujo.rotuloDelEje(angulos.get(d.id)!, d.nombre);
        const ancho = dibujo.anchoDelNumero(`${d.id} · 123 reportes`);
        const [x, y] = dibujo.lugarDelOrden(r, ancho);
        if (r.ancla === "start") expect(x - dibujo.R_ORDEN).toBeGreaterThan(r.x + ancho);
        else expect(x + dibujo.R_ORDEN).toBeLessThan(r.x - ancho);
        // Más lejos del centro que el comienzo del número: hacia afuera.
        expect(Math.abs(x - dibujo.CX)).toBeGreaterThan(Math.abs(r.x - dibujo.CX));
        expect(y).toBeCloseTo(r.yNumero - 4);
      }
    }
    // El diseño: «1.6» a la izquierda, con el círculo a ~33 de su final.
    expect(dibujo.lugarDelOrden({ x: 252.4, ancla: "end", yNumero: 460.6 }, 16)[0]).toBeCloseTo(219.4);
  });

  /** Lo que ocupa cada cosa del dibujo, para ver que nada se pise. */
  const solapan = (p: dibujo.Caja, q: dibujo.Caja) => p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;
  const cajaDeCirculo = ([x, y]: [number, number], r: number): dibujo.Caja => ({ x0: x - r, x1: x + r, y0: y - r, y1: y + r });

  it("ningún rótulo pisa un cruce ni a otro rótulo, ni se sale del dibujo (con el número de orden, reportes y la nota)", () => {
    expect(AREAS_QUE_SE_VEN.length).toBeGreaterThan(real.areas.length);
    for (const a of AREAS_QUE_SE_VEN) {
      const angulos = dibujo.angulosDeLosEjes(a.dimensiones);
      const todos = [...angulos.values()];
      // Cada cruce, del tamaño del elegido con su halo: el más grande que se dibuja.
      const cruces = a.dimensiones.flatMap((d) => LETRAS.map((_, k) => cajaDeCirculo(dibujo.cruce(angulos.get(d.id)!, k), dibujo.HALO)));
      for (const conNota of [false, true]) {
        const rotulos = a.dimensiones.map((d) =>
          dibujo.cajaDelRotulo(dibujo.rotuloDelEje(angulos.get(d.id)!, d.nombre, conNota), `${d.id} · 123 reportes`, true, conNota),
        );
        rotulos.forEach((r, i) => {
          const nombre = `${a.nombre} ${a.dimensiones[i].id}${conNota ? " con nota" : ""}`;
          expect(r.x0, nombre).toBeGreaterThanOrEqual(0);
          expect(r.x1, nombre).toBeLessThanOrEqual(dibujo.W);
          expect(r.y0, nombre).toBeGreaterThanOrEqual(0);
          expect(r.y1, nombre).toBeLessThanOrEqual(dibujo.H);
          for (const c of cruces) expect(solapan(r, c), nombre).toBe(false);
          rotulos.forEach((otro, j) => {
            if (j !== i) expect(solapan(r, otro), `${nombre} y ${a.dimensiones[j].id}`).toBe(false);
          });
        });
        // El nombre de cada mitad, al costado, tampoco pisa un rótulo ni un cruce.
        for (const c of ["base", "produccion"] as const) {
          const m = dibujo.rotuloDeLaMitad(
            c,
            c === "base" ? "Base operativa" : "Producción",
            c === "base" ? "cómo está montado el área por dentro" : "qué entrega el área hacia afuera",
          );
          const ancho = Math.max(...m.nombre.map((l) => l.texto.length * 18), ...m.descripcion.map((l) => l.texto.length * 6.8));
          const caja: dibujo.Caja = {
            x0: m.ancla === "start" ? m.x : m.x - ancho,
            x1: m.ancla === "start" ? m.x + ancho : m.x,
            y0: m.nombre[0].y - 22,
            y1: (m.descripcion.at(-1)?.y ?? m.nombre.at(-1)!.y) + 4,
          };
          expect(caja.x0).toBeGreaterThanOrEqual(0);
          expect(caja.x1).toBeLessThanOrEqual(dibujo.W);
          for (const r of rotulos) expect(solapan(caja, r), `mitad ${c}`).toBe(false);
          for (const cr of cruces) expect(solapan(caja, cr), `mitad ${c}`).toBe(false);
        }
      }
      // Los nombres de las etapas, en el hueco de arriba, y el chip de «La base», abajo, tampoco pisan un cruce, ni el
      // elegido (su halo es un anillo tenue, y puede rozar la punta de «Deficiente»). A 10,5 px, ~5,4 por letra.
      const elegidos = a.dimensiones.flatMap((d) => LETRAS.map((_, k) => cajaDeCirculo(dibujo.cruce(angulos.get(d.id)!, k), dibujo.CRUCE_ELEGIDO)));
      // Con las medidas que usa el componente: el tamaño de letra y la altura salen de radar-dibujo.ts.
      const etapas = real.niveles.map((nivel, k) => {
        const y = dibujo.yDelNombreDeEtapa(todos, k);
        const medio = (nivel.nombre.length * dibujo.LETRA_DE_ETAPA * 0.52) / 2;
        return { x0: dibujo.CX - medio, x1: dibujo.CX + medio, y0: y - dibujo.LETRA_DE_ETAPA * 0.75, y1: y + 2 };
      });
      const chip = dibujo.cajaDelChipDeLaBase(todos);
      for (const c of elegidos) {
        for (const e of etapas) expect(solapan(e, c), a.nombre).toBe(false);
        expect(solapan(chip, c), a.nombre).toBe(false);
      }
    }
  });

  it("dos cruces vecinos no se tocan, ni siquiera el elegido con su halo", () => {
    for (const a of real.areas) {
      const angulos = dibujo.angulosDeLosEjes(a.dimensiones);
      const puntos = a.dimensiones.flatMap((d) => LETRAS.map((_, k) => dibujo.cruce(angulos.get(d.id)!, k)));
      for (let i = 0; i < puntos.length; i++)
        for (let j = i + 1; j < puntos.length; j++) {
          expect(Math.hypot(puntos[i][0] - puntos[j][0], puntos[i][1] - puntos[j][1])).toBeGreaterThan(dibujo.HALO + dibujo.CRUCE_EN_FOCO);
        }
    }
  });

  it("el nombre de cada mitad va al costado, como en el diseño", () => {
    const base = dibujo.rotuloDeLaMitad("base", "Base operativa", "cómo está montado el departamento por dentro");
    expect(base.ancla).toBe("start");
    expect(base.x).toBe(800);
    expect(base.nombre.map((l) => [l.texto, l.y])).toEqual([
      ["BASE", 368],
      ["OPERATIVA", 400],
    ]);
    expect(base.descripcion.map((l) => [l.texto, l.y])).toEqual([
      ["cómo está montado el", 424],
      ["departamento por dentro", 441],
    ]);
    expect(dibujo.rotuloDeLaMitad("produccion", "Producción", "qué entrega el departamento hacia afuera").nombre).toEqual([{ texto: "PRODUCCIÓN", y: 384 }]);
  });

  it("los rótulos de las dimensiones caen donde el diseño los pone", () => {
    const r = dibujo.rotuloDelEje(22.5, "Procesos y Rutinas");
    expect([r.x, r.yNumero, r.nombre[0].y].map((v) => Math.round(v * 10) / 10)).toEqual([602.6, 114.4, 132.4]);
    const lado = dibujo.rotuloDelEje(67.5, "Tecnología y Automatización");
    expect(lado.nombre.map((l) => l.texto)).toEqual(["Tecnología y", "Automatización"]);
    expect(Math.round(lado.yNumero * 10) / 10).toBe(255.4);
  });

  it("la porción de un eje va del centro hasta la mitad del camino a cada vecino", () => {
    const angulos = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
    expect(dibujo.porcionDelEje(angulos, 22.5)).toHaveLength(4);
    expect(dibujo.porcionDelEje(angulos, 22.5)[0]).toEqual([dibujo.CX, dibujo.CY]);
    expect(dibujo.porcionDelEje(angulos, 99)).toEqual([]);
  });

  it("las porciones se tocan sin hueco ni encimarse, también del último eje al primero, y llegan pasado Óptimo", () => {
    const cerca = (p: [number, number]) => p.map((v) => Math.round(v * 1000) / 1000);
    for (const a of real.areas) {
      const ang = dibujo.angulosDeLosEjes(a.dimensiones);
      const orden = [...ang.values()].sort((x, y) => x - y);
      for (let i = 0; i < orden.length; i++) {
        const esta = dibujo.porcionDelEje(orden, orden[i]);
        const siguiente = dibujo.porcionDelEje(orden, orden[(i + 1) % orden.length]);
        // El borde de salida de una es el de entrada de la siguiente.
        expect(cerca(esta[3])).toEqual(cerca(siguiente[1]));
        // Y el eje queda adentro de su porción: entre sus dos bordes, en el sentido de las agujas.
        const borde0 = Math.atan2(esta[1][0] - dibujo.CX, dibujo.CY - esta[1][1]);
        const borde1 = Math.atan2(esta[3][0] - dibujo.CX, dibujo.CY - esta[3][1]);
        const abre = (((borde1 - borde0) * 180) / Math.PI + 360) % 360;
        expect(abre).toBeGreaterThan(0);
        expect(abre).toBeLessThan(180);
        expect(Math.hypot(esta[2][0] - dibujo.CX, esta[2][1] - dibujo.CY)).toBeGreaterThan(dibujo.radioDeLaEtapa(4) + dibujo.CRUCE);
      }
    }
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

describe("qué cuenta cada cruce: la celda del Mapa", () => {
  it("un eje por dimensión, en el orden de la escala, con la cuenta de cada etapa", () => {
    const ejes = ejesDeLaTeoria(area, SIN_PERFIL, req, "criterios");
    expect(ejes.map((e) => e.dimensionId)).toEqual(area.dimensiones.map((d) => d.id));
    // 1.1: D1, I1, F1–F3, E1–E2, O1–O2.
    expect(ejes[0].cuentas).toEqual({ D: 1, I: 1, F: 3, E: 2, O: 2 });
  });

  it("cada filtro cuenta lo suyo: hábitos y riesgos", () => {
    // 1.1: los hábitos son F2 y E2; el riesgo, F3.
    expect(ejesDeLaTeoria(area, SIN_PERFIL, req, "habitos")[0].cuentas).toEqual({ D: 0, I: 0, F: 1, E: 1, O: 0 });
    expect(ejesDeLaTeoria(area, SIN_PERFIL, req, "riesgos")[0].cuentas).toEqual({ D: 0, I: 0, F: 1, E: 0, O: 0 });
    // Tracción no tiene riesgos: todo en 0 (puntos grises).
    expect(Object.values(ejesDeLaTeoria(area, SIN_PERFIL, req, "riesgos")[1].cuentas)).toEqual([0, 0, 0, 0, 0]);
  });

  it("con el perfil cuentan solo los que aplican, y los escondidos van aparte", () => {
    const perfil = { cierre: "transaccional" as const, despues: null };
    expect(ejesDeLaTeoria(area, perfil, req, "criterios")[0].cuentas.F).toBe(2);
    expect(ejesDeLaTeoria(area, perfil, req, "perfil")[0].cuentas).toEqual({ D: 0, I: 0, F: 1, E: 0, O: 0 });
    // Sin perfil no hay nada escondido.
    expect(ejesDeLaTeoria(area, SIN_PERFIL, req, "perfil").every((e) => LETRAS.every((l) => e.cuentas[l] === 0))).toBe(true);
  });

  it("la lista del panel es la del número: los mismos criterios que cuenta el cruce, en cada filtro y perfil", () => {
    for (const a of real.areas) {
      const r = requeridosDelArea(real, a);
      for (const perfil of PERFILES)
        for (const que of QUES) {
          const ejes = ejesDeLaTeoria(a, perfil, r, que);
          a.dimensiones.forEach((d, i) => {
            for (const nv of d.niveles) {
              const lista = criteriosDelCruce(d, nv, que, perfil, r);
              expect(lista.length, `${nv.id} ${que}`).toBe(ejes[i].cuentas[nv.letra]);
              expect(lista.every((c) => nv.criterios.includes(c))).toBe(true);
            }
          });
        }
    }
  });

  it("«Escondidos por el perfil» solo se ofrece con un perfil elegido", () => {
    expect(opcionesDeQueSeCuenta(SIN_PERFIL)).toEqual(["criterios", "habitos", "riesgos", "requeridos"]);
    expect(opcionesDeQueSeCuenta({ cierre: "mixta", despues: null })).toContain("perfil");
    expect(opcionesDeQueSeCuenta({ cierre: null, despues: null, trafico: null })).not.toContain("perfil");
    expect(conPerfil({ cierre: null, despues: null })).toBe(false);
  });

  it("se dice con sus palabras: «1 hábito», «3 criterios de riesgo»", () => {
    expect(enPalabras(1, "habitos")).toBe("1 hábito");
    expect(enPalabras(3, "riesgos")).toBe("3 criterios de riesgo");
    expect(enPalabras(0, "criterios")).toBe("0 criterios");
    expect(QUE_SE_CUENTA.map((q) => q.etiqueta)).toEqual(["Todos los criterios", "Hábitos", "Riesgos", "Requeridos", "Escondidos por el perfil"]);
  });
});

describe("las cuentas con la escala publicada, con perfil y sin perfil", () => {
  /** La regla de siempre del Mapa, escrita aparte: si `cuentaDeLaCelda` se mueve, esta prueba lo nota. */
  function aMano(criterios: readonly Criterio[], que: QueSeCuenta, perfil: Perfil, r: RequeridosDelArea): number {
    const visibles = criterios.filter((c) => aplica(c, perfil));
    if (que === "perfil") return criterios.length - visibles.length;
    if (que === "habitos") return visibles.filter((c) => c.habito).length;
    if (que === "riesgos") return visibles.filter((c) => c.riesgo).length;
    if (que === "requeridos") return visibles.filter((c) => enlacesQueAplican(r.loRequieren[c.id], perfil).length > 0).length;
    return visibles.length;
  }

  it("cada celda cuenta lo mismo que contaba el Mapa, en cada filtro y cada perfil", () => {
    let celdas = 0;
    for (const a of real.areas) {
      const r = requeridosDelArea(real, a);
      for (const perfil of PERFILES)
        for (const d of a.dimensiones)
          for (const nv of d.niveles)
            for (const que of QUES) {
              celdas++;
              expect(cuentaDeLaCelda(nv.criterios, que, perfil, r), `${nv.id} ${que} ${JSON.stringify(perfil)}`).toBe(aMano(nv.criterios, que, perfil, r));
            }
    }
    expect(celdas).toBeGreaterThan(1000);
  });

  it("los cruces de un área suman sus criterios: todos sin perfil, y con uno, los que aplican en las dimensiones que aplican", () => {
    for (const a of real.areas) {
      const r = requeridosDelArea(real, a);
      const suma = (perfil: Perfil, que: QueSeCuenta) => ejesDeLaTeoria(a, perfil, r, que).reduce((s, e) => s + LETRAS.reduce((t, l) => t + e.cuentas[l], 0), 0);
      const criteriosDe = (dims: typeof a.dimensiones) => dims.flatMap((d) => d.niveles.flatMap((nv) => nv.criterios));
      expect(suma(SIN_PERFIL, "criterios"), a.nombre).toBe(criteriosDe(a.dimensiones).length);
      for (const perfil of PERFILES.slice(1)) {
        const aplican = criteriosDe(a.dimensiones.filter((d) => dimensionAplica(d, perfil))).filter((c) => aplica(c, perfil)).length;
        expect(suma(perfil, "criterios"), `${a.nombre} ${JSON.stringify(perfil)}`).toBe(aplican);
        // Los escondidos son los que el perfil saca, criterio por criterio (la regla del Mapa).
        expect(suma(perfil, "perfil")).toBe(criteriosDe(a.dimensiones).filter((c) => !aplica(c, perfil)).length);
      }
    }
  });

  it("una dimensión que no aplica al perfil queda en 0, salvo lo que el perfil esconde", () => {
    let vistas = 0;
    for (const perfil of PERFILES.slice(1)) {
      for (const a of real.areas) {
        const r = requeridosDelArea(real, a);
        a.dimensiones.forEach((d, i) => {
          if (dimensionAplica(d, perfil)) return;
          vistas++;
          for (const que of ["criterios", "habitos", "riesgos", "requeridos"] as const) {
            const e = ejesDeLaTeoria(a, perfil, r, que)[i];
            expect(e.aplica).toBe(false);
            expect(LETRAS.every((l) => e.cuentas[l] === 0)).toBe(true);
          }
          const escondidos = ejesDeLaTeoria(a, perfil, r, "perfil")[i];
          for (const nv of d.niveles) expect(escondidos.cuentas[nv.letra]).toBe(cuentaDeLaCelda(nv.criterios, "perfil", perfil, r));
        });
      }
    }
    // Si la escala deja de tener una dimensión que no aplica a algún cierre, esta prueba ya no prueba nada.
    expect(vistas).toBeGreaterThan(0);
  });

  it("hábitos, riesgos y requeridos tienen, en cada área, celdas en 0 y celdas con algo", () => {
    for (const a of real.areas) {
      const r = requeridosDelArea(real, a);
      const todos = ejesDeLaTeoria(a, SIN_PERFIL, r, "criterios").reduce((s, e) => s + LETRAS.reduce((t, l) => t + e.cuentas[l], 0), 0);
      for (const que of ["habitos", "riesgos", "requeridos"] as const) {
        const valores = ejesDeLaTeoria(a, SIN_PERFIL, r, que).flatMap((e) => LETRAS.map((l) => e.cuentas[l]));
        expect(valores.some((v) => v === 0), `${a.nombre} ${que}`).toBe(true);
        expect(valores.some((v) => v > 0), `${a.nombre} ${que}`).toBe(true);
        expect(valores.reduce((s, v) => s + v, 0), `${a.nombre} ${que}`).toBeLessThan(todos);
      }
    }
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
});
