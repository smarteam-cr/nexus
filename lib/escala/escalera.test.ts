/**
 * lib/escala/escalera.test.ts — LA ESCALERA de los cinco niveles (lib/escala/escalera.ts): dónde está hoy, a dónde lo
 * llevamos (Funcional casi siempre; desde Funcional, el siguiente; la que elige quien presenta, si está por encima) y que el
 * dibujo marque los dos y el tramo entre ellos (la curva de la aplicación vieja desde el 21 nov: que nada se salga del
 * lienzo, que los nombres no se pisen y que el tramo sea la misma curva).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANCHO_DE_LA_ESCALERA,
  BASE_DEL_AREA,
  IZQUIERDA_DEL_LIENZO,
  LETRA_DEL_NOMBRE_EN_EL_PDF,
  LETRA_DEL_NOMBRE_EN_EL_TELEFONO,
  dibujoDeLaEscalera,
  ETIQUETA,
  lecturaDeLaEscalera,
  marcaDelNivel,
  metaDeLaEscalera,
  metaPorDefecto,
  metasPosibles,
  PUNTOS_DE_LA_ESCALERA,
  trazosDeLaEscalera,
} from "./escalera";

const NIVELES = [
  { letra: "D" as const, nombre: "Deficiente" },
  { letra: "I" as const, nombre: "Inicial" },
  { letra: "F" as const, nombre: "Funcional" },
  { letra: "E" as const, nombre: "Eficiente" },
  { letra: "O" as const, nombre: "Óptimo" },
];

describe("a dónde lo llevamos", () => {
  it("Funcional desde abajo; desde Funcional o más arriba, el nivel siguiente; en Óptimo, ninguno", () => {
    expect(metaPorDefecto("D")).toBe("F");
    expect(metaPorDefecto("I")).toBe("F");
    expect(metaPorDefecto("F")).toBe("E");
    expect(metaPorDefecto("E")).toBe("O");
    expect(metaPorDefecto("O")).toBeNull();
    expect(metaPorDefecto(null)).toBeNull();
  });

  it("la que elige quien presenta vale solo si está por encima de hoy; si no, la de siempre", () => {
    expect(metaDeLaEscalera("D", "E")).toBe("E");
    expect(metaDeLaEscalera("I", "i")).toBe("F");
    // Los niveles subieron y la elegida quedó igual o abajo: vuelve la de siempre.
    expect(metaDeLaEscalera("F", "F")).toBe("E");
    expect(metaDeLaEscalera("E", "F")).toBe("O");
    expect(metaDeLaEscalera("I", "Z")).toBe("F");
    expect(metaDeLaEscalera("I", "")).toBe("F");
    expect(metaDeLaEscalera(null, "F")).toBeNull();
  });

  it("solo se puede elegir un nivel de arriba", () => {
    expect(metasPosibles("I")).toEqual(["F", "E", "O"]);
    expect(metasPosibles("O")).toEqual([]);
    expect(metasPosibles(null)).toEqual([]);
  });
});

describe("el dibujo", () => {
  const TODAS = [null, "D", "I", "F", "E", "O"] as const;

  it("cinco niveles numerados de izquierda a derecha y de abajo arriba: la curva sube despacio y después se dispara", () => {
    const d = dibujoDeLaEscalera(NIVELES, "I", "F");
    expect(d.marcas.map((m) => `${m.numero} ${m.nombre}`)).toEqual(["1 Deficiente", "2 Inicial", "3 Funcional", "4 Eficiente", "5 Óptimo"]);
    const subidas: number[] = [];
    for (let i = 1; i < d.marcas.length; i++) {
      expect(d.marcas[i].x).toBeGreaterThan(d.marcas[i - 1].x);
      expect(d.marcas[i].y).toBeLessThan(d.marcas[i - 1].y);
      subidas.push((d.marcas[i - 1].y - d.marcas[i].y) / (d.marcas[i].x - d.marcas[i - 1].x));
    }
    // Cada tramo es más empinado que el anterior (la exponencial de la vieja, no una S).
    for (let i = 1; i < subidas.length; i++) expect(subidas[i]).toBeGreaterThan(subidas[i - 1]);
  });

  it("con cualquier hoy y meta, todo cabe en el lienzo: las etiquetas, los círculos y los nombres", () => {
    for (const hoy of TODAS) {
      for (const meta of TODAS) {
        const d = dibujoDeLaEscalera(NIVELES, hoy, meta);
        const { y, alto, ancho } = d.caja;
        expect(ancho).toBe(ANCHO_DE_LA_ESCALERA);
        for (const m of d.marcas) {
          const arriba = m.etiqueta ? m.etiqueta.y : m.y - m.r;
          expect(arriba, `${hoy}→${meta}: ${m.letra} se sale por arriba`).toBeGreaterThanOrEqual(y + 10);
          expect(m.yNombre + 10, `${hoy}→${meta}: ${m.letra} se sale por abajo`).toBeLessThanOrEqual(y + alto);
          if (m.etiqueta) {
            expect(m.etiqueta.x).toBeGreaterThan(IZQUIERDA_DEL_LIENZO);
            expect(m.etiqueta.x + ETIQUETA.ancho).toBeLessThan(IZQUIERDA_DEL_LIENZO + ANCHO_DE_LA_ESCALERA);
          }
        }
      }
    }
  });

  it("sin la meta en Óptimo, el lienzo no deja una franja vacía arriba", () => {
    const abajo = dibujoDeLaEscalera(NIVELES, "I", "F");
    const arriba = dibujoDeLaEscalera(NIVELES, "E", "O");
    expect(abajo.caja.y).toBeGreaterThan(arriba.caja.y);
    // Lo más alto es el círculo de Óptimo, con su margen.
    expect(abajo.caja.y).toBe(Math.floor(PUNTOS_DE_LA_ESCALERA[4].y - 24 - 18));
  });

  it("los nombres de los niveles no se pisan entre ellos ni con el círculo de al lado (ni con la letra grande del teléfono)", () => {
    const d = dibujoDeLaEscalera(NIVELES, "I", "F");
    // Unos 0,6 em por letra con la letra del teléfono (la más grande): el ancho de cada nombre.
    const medio = (m: (typeof d.marcas)[number]) => (m.nombre.length * LETRA_DEL_NOMBRE_EN_EL_TELEFONO * 0.6) / 2;
    for (let i = 1; i < d.marcas.length; i++) {
      const a = d.marcas[i - 1];
      const b = d.marcas[i];
      expect(a.x + medio(a), `${a.nombre} y ${b.nombre}`).toBeLessThan(b.x - medio(b));
    }
    for (const m of d.marcas) {
      expect(m.x - medio(m), `${m.nombre} se corta a la izquierda`).toBeGreaterThan(IZQUIERDA_DEL_LIENZO);
      expect(m.x + medio(m), `${m.nombre} se corta a la derecha`).toBeLessThan(IZQUIERDA_DEL_LIENZO + ANCHO_DE_LA_ESCALERA);
    }
  });

  it("quieta, es el trazo de la aplicación vieja", () => {
    const d = dibujoDeLaEscalera(NIVELES, "I", "F");
    const vieja = "M 80 305 C 140 304,175 301,220 292 C 290 282,320 270,385 252 C 450 235,480 210,550 160 C 605 118,660 68,740 42";
    const numeros = (t: string) => t.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(numeros(d.curva)).toEqual(numeros(vieja));
  });

  it("la letra de los nombres que la prueba de arriba supone es la que pone resultado.css (teléfono y PDF)", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "components/external/test/resultado.css"), "utf8");
    const telefono = css.slice(css.indexOf("@media (max-width: 600px)", css.indexOf("La escalera de los niveles")));
    expect(telefono.match(/\.esc-nombre \{ font-size: (\d+)px/)?.[1]).toBe(String(LETRA_DEL_NOMBRE_EN_EL_TELEFONO));
    expect(css.match(/\.rd-pdf \.esc-svg \.esc-nombre \{ font-size: (\d+)px/)?.[1]).toBe(String(LETRA_DEL_NOMBRE_EN_EL_PDF));
    // La del PDF no puede pasar la del teléfono: con más, los nombres se pisan (la prueba de arriba).
    expect(LETRA_DEL_NOMBRE_EN_EL_PDF).toBeLessThanOrEqual(LETRA_DEL_NOMBRE_EN_EL_TELEFONO);
  });

  it("sin movimiento (el PDF) el lienzo se ciñe al dibujo: más chico que en la pantalla y sin cortar nada", () => {
    for (const [hoy, meta] of [["I", "F"], ["E", "O"]] as const) {
      const viva = dibujoDeLaEscalera(NIVELES, hoy, meta);
      const quieta = dibujoDeLaEscalera(NIVELES, hoy, meta, { quieta: true });
      expect(quieta.caja.alto).toBeLessThan(viva.caja.alto);
      for (const m of quieta.marcas) {
        expect(m.etiqueta ? m.etiqueta.y : m.y - m.r).toBeGreaterThanOrEqual(quieta.caja.y);
        expect(m.yNombre + 8).toBeLessThanOrEqual(quieta.caja.y + quieta.caja.alto);
      }
    }
  });

  it("el área baja hasta la base y el tramo es la misma curva entre hoy y la meta", () => {
    const d = dibujoDeLaEscalera(NIVELES, "I", "F");
    expect(d.area.startsWith(d.curva)).toBe(true);
    expect(d.area).toMatch(new RegExp(`L 740.0 ${BASE_DEL_AREA} L 80.0 ${BASE_DEL_AREA} Z$`));
    // Arranca en hoy (Inicial) y su único pedazo es el segundo de la curva, que termina en la meta (Funcional).
    expect(d.tramo!.startsWith("M 220.0 292.0 ")).toBe(true);
    const pedazos = d.curva.split(" C ").slice(1).map((p) => `C ${p}`.trim());
    expect(d.tramo!.slice("M 220.0 292.0 ".length)).toBe(pedazos[1]);
    expect(pedazos[1].endsWith("385.0 252.0")).toBe(true);
  });

  it("los trazos siguen a los puntos cuando el imán los corre", () => {
    const corridos = PUNTOS_DE_LA_ESCALERA.map((p) => ({ x: p.x + 5, y: p.y - 3 }));
    const t = trazosDeLaEscalera(corridos, 0, 4);
    expect(t.curva.startsWith("M 85.0 302.0 ")).toBe(true);
    expect(t.tramo!.endsWith("745.0 39.0")).toBe(true);
    expect(trazosDeLaEscalera(corridos, 2, 2).tramo).toBeNull();
  });

  it("el color de cada nivel justo en su punto", () => {
    const d = dibujoDeLaEscalera(NIVELES, "I", "F");
    expect(d.paradas[0]).toEqual({ offset: 0, color: "#dc4a3d" });
    expect(d.paradas[4]).toEqual({ offset: 1, color: "#17a884" });
    expect(d.paradas[2].offset).toBeCloseTo((385 - 80) / 660, 1);
  });

  it("marca hoy y la meta, con su etiqueta arriba; una meta igual o debajo de hoy no se dibuja", () => {
    const d = dibujoDeLaEscalera(NIVELES, "I", "F");
    expect(d.marcas.filter((m) => m.es === "hoy").map((m) => m.letra)).toEqual(["I"]);
    expect(d.marcas.filter((m) => m.es === "meta").map((m) => m.letra)).toEqual(["F"]);
    expect(d.marcas.filter((m) => m.etiqueta).map((m) => m.letra)).toEqual(["I", "F"]);
    const mal = dibujoDeLaEscalera(NIVELES, "F", "I");
    expect(mal.marcas.some((m) => m.es === "meta")).toBe(false);
    expect(mal.tramo).toBeNull();
  });

  it("sin meta (Óptimo) o sin nivel, no hay tramo; sin nivel, nadie es «hoy»", () => {
    expect(dibujoDeLaEscalera(NIVELES, "O", null).tramo).toBeNull();
    const sin = dibujoDeLaEscalera(NIVELES, null, null);
    expect(sin.tramo).toBeNull();
    expect(sin.marcas.some((m) => m.es)).toBe(false);
  });

  it("lo que lee un lector de pantalla", () => {
    expect(lecturaDeLaEscalera("Ventas", { nombre: "Inicial" }, { nombre: "Funcional" })).toBe("Los cinco niveles de la escala: Ventas está hoy en Inicial y la meta es llevarla a Funcional.");
    expect(lecturaDeLaEscalera("Ventas", { nombre: "Óptimo" }, null)).toContain("el nivel más alto");
    expect(lecturaDeLaEscalera("Ventas", null, null)).toContain("en medición");
  });

  it("la tarjeta de un nivel dice si es donde está hoy o la meta", () => {
    expect(marcaDelNivel("Ventas", "hoy")).toBe("Aquí está Ventas hoy.");
    expect(marcaDelNivel("Ventas", "meta")).toContain("meta");
    expect(marcaDelNivel("Ventas", null)).toBeNull();
  });
});
