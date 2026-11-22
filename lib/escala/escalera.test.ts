/**
 * lib/escala/escalera.test.ts — LA ESCALERA de los cinco niveles (lib/escala/escalera.ts), idéntica a la curva de la página
 * de resultados de la aplicación vieja desde el 21 nov (sin meta): el mismo trazo, los mismos colores, los mismos niveles
 * marcados (donde está cada capa) y que los nombres no se pisen con la letra del teléfono y del PDF.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AZUL_DE_LA_ESCALERA,
  BAJO_EL_PUNTO,
  BASE_DEL_AREA,
  COLOR_DE_LA_ESCALERA,
  dibujoDeLaEscalera,
  GRIS_DE_LA_ESCALERA,
  LETRA_DEL_NOMBRE_EN_EL_PDF,
  LETRA_DEL_NOMBRE_EN_EL_TELEFONO,
  LIENZO,
  lecturaDeLaEscalera,
  marcaDelNivel,
  nivelesMarcados,
  PUNTOS_DE_LA_ESCALERA,
  RADIO,
  trazosDeLaEscalera,
} from "./escalera";

const NIVELES = [
  { letra: "D" as const, nombre: "Deficiente" },
  { letra: "I" as const, nombre: "Inicial" },
  { letra: "F" as const, nombre: "Funcional" },
  { letra: "E" as const, nombre: "Eficiente" },
  { letra: "O" as const, nombre: "Óptimo" },
];
const CAPAS = (base: "D" | "I" | "F" | "E" | "O" | null, prod: "D" | "I" | "F" | "E" | "O" | null) => [
  { nombre: "Base operativa", nivel: base },
  { nombre: "Producción", nivel: prod },
];

describe("lo que es de la vieja (curva.js, niveles.js)", () => {
  it("el lienzo, los colores de cada nivel, el gris y el azul", () => {
    expect(LIENZO).toEqual({ x: 0, y: 0, ancho: 820, alto: 380 });
    expect(COLOR_DE_LA_ESCALERA).toEqual({ D: "#F87171", I: "#FB923C", F: "#FBBF24", E: "#60A5FA", O: "#42E4B3" });
    expect(GRIS_DE_LA_ESCALERA).toBe("#6B7AA0");
    expect(AZUL_DE_LA_ESCALERA).toBe("#0B58D3");
    expect(RADIO).toEqual({ nivel: 26, activo: 32 });
    expect(BAJO_EL_PUNTO).toEqual({ numero: 8, nombre: 60 });
  });

  it("quieta, es el trazo de la vieja, y el área baja hasta la base", () => {
    const d = dibujoDeLaEscalera(NIVELES, []);
    const vieja = "M 80 305 C 140 304,175 301,220 292 C 290 282,320 270,385 252 C 450 235,480 210,550 160 C 605 118,660 68,740 42";
    const numeros = (t: string) => t.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(numeros(d.curva)).toEqual(numeros(vieja));
    expect(d.area.startsWith(d.curva)).toBe(true);
    expect(d.area).toMatch(new RegExp(`L 740.0 ${BASE_DEL_AREA} L 80.0 ${BASE_DEL_AREA} Z$`));
  });

  it("cinco niveles numerados de izquierda a derecha y de abajo arriba: la curva sube despacio y después se dispara", () => {
    const d = dibujoDeLaEscalera(NIVELES, []);
    expect(d.marcas.map((m) => `${m.numero} ${m.nombre}`)).toEqual(["1 Deficiente", "2 Inicial", "3 Funcional", "4 Eficiente", "5 Óptimo"]);
    const subidas: number[] = [];
    for (let i = 1; i < d.marcas.length; i++) subidas.push((d.marcas[i - 1].y - d.marcas[i].y) / (d.marcas[i].x - d.marcas[i - 1].x));
    for (let i = 1; i < subidas.length; i++) expect(subidas[i]).toBeGreaterThan(subidas[i - 1]);
  });

  it("los trazos siguen a los puntos cuando el imán los corre", () => {
    const corridos = PUNTOS_DE_LA_ESCALERA.map((p) => ({ x: p.x + 5, y: p.y - 3 }));
    const t = trazosDeLaEscalera(corridos);
    expect(t.curva.startsWith("M 85.0 302.0 ")).toBe(true);
    expect(t.curva.endsWith("745.0 39.0")).toBe(true);
  });
});

describe("qué niveles se marcan (la vieja: `activos: [base, producción]`)", () => {
  it("donde está cada capa, con «tu {capa}»; las dos en el mismo nivel, juntas", () => {
    expect(nivelesMarcados("Ventas", CAPAS("I", "F"), "I")).toEqual([
      { letra: "I", quienes: ["tu Base operativa"] },
      { letra: "F", quienes: ["tu Producción"] },
    ]);
    expect(nivelesMarcados("Ventas", CAPAS("F", "F"), "F")).toEqual([{ letra: "F", quienes: ["tu Base operativa", "tu Producción"] }]);
    expect(nivelesMarcados("Ventas", CAPAS(null, "E"), "E")).toEqual([{ letra: "E", quienes: ["tu Producción"] }]);
  });

  it("sin el nivel de las capas, el del área; sin ninguno, nada", () => {
    expect(nivelesMarcados("Ventas", CAPAS(null, null), "I")).toEqual([{ letra: "I", quienes: ["Ventas hoy"] }]);
    expect(nivelesMarcados("Ventas", [], null)).toEqual([]);
  });

  it("el marcado va con su color y un círculo más grande; el resto, en gris", () => {
    const d = dibujoDeLaEscalera(NIVELES, nivelesMarcados("Ventas", CAPAS("I", "F"), "I"));
    expect(d.marcas.filter((m) => m.activo).map((m) => m.letra)).toEqual(["I", "F"]);
    expect(d.marcas.map((m) => m.r)).toEqual([26, 32, 32, 26, 26]);
    expect(d.marcas[1].color).toBe("#FB923C");
  });

  it("la tarjeta dice quién está ahí (la vieja: «Aquí está tu Base operativa y tu Producción.»)", () => {
    expect(marcaDelNivel(["tu Base operativa", "tu Producción"])).toBe("Aquí está tu Base operativa y tu Producción.");
    expect(marcaDelNivel(["Ventas hoy"])).toBe("Aquí está Ventas hoy.");
    expect(marcaDelNivel([])).toBeNull();
  });

  it("lo que lee un lector de pantalla", () => {
    const d = dibujoDeLaEscalera(NIVELES, nivelesMarcados("Ventas", CAPAS("I", "F"), "I"));
    expect(lecturaDeLaEscalera("Ventas", d.marcas)).toBe(
      "Los cinco niveles de la escala, de Deficiente a Óptimo: tu Base operativa en Inicial; tu Producción en Funcional.",
    );
    expect(lecturaDeLaEscalera("Ventas", dibujoDeLaEscalera(NIVELES, []).marcas)).toContain("en medición");
  });
});

describe("la letra que crece (lo único que no es de la vieja)", () => {
  it("los nombres no se pisan entre ellos ni se cortan, con la letra del teléfono", () => {
    const d = dibujoDeLaEscalera(NIVELES, []);
    // Unos 0,6 em por letra: el ancho de cada nombre.
    const medio = (m: (typeof d.marcas)[number]) => (m.nombre.length * LETRA_DEL_NOMBRE_EN_EL_TELEFONO * 0.6) / 2;
    for (let i = 1; i < d.marcas.length; i++) {
      const a = d.marcas[i - 1];
      const b = d.marcas[i];
      expect(a.x + medio(a), `${a.nombre} y ${b.nombre}`).toBeLessThan(b.x - medio(b));
    }
    for (const m of d.marcas) {
      expect(m.x - medio(m), `${m.nombre} se corta a la izquierda`).toBeGreaterThan(LIENZO.x);
      expect(m.x + medio(m), `${m.nombre} se corta a la derecha`).toBeLessThan(LIENZO.x + LIENZO.ancho);
      expect(m.y + BAJO_EL_PUNTO.nombre + 6, `${m.nombre} se corta abajo`).toBeLessThanOrEqual(LIENZO.y + LIENZO.alto);
    }
  });

  it("la letra que la prueba de arriba supone es la que pone resultado.css (teléfono y PDF)", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "components/external/test/resultado.css"), "utf8");
    const telefono = css.slice(css.indexOf("@media (max-width: 600px)", css.indexOf("La escalera de los niveles")));
    expect(telefono.match(/\.esc-nombre \{ font-size: (\d+)px/)?.[1]).toBe(String(LETRA_DEL_NOMBRE_EN_EL_TELEFONO));
    expect(css.match(/\.rd-pdf \.esc-svg \.esc-nombre \{ font-size: (\d+)px/)?.[1]).toBe(String(LETRA_DEL_NOMBRE_EN_EL_PDF));
    expect(LETRA_DEL_NOMBRE_EN_EL_PDF).toBeLessThanOrEqual(LETRA_DEL_NOMBRE_EN_EL_TELEFONO);
  });
});
