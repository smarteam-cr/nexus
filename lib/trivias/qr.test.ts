/**
 * lib/trivias/qr.test.ts — el codificador de QR propio (lib/trivias/qr.ts).
 *
 * Tres cosas lo sostienen:
 * 1. Los vectores conocidos de la norma ISO/IEC 18004: los bits de formato del nivel M con cada máscara, los de
 *    versión 7 a 10 y la corrección Reed-Solomon del ejemplo «HELLO WORLD» 1-M.
 * 2. Dos GOLDEN CONGELADOS: el QR del enlace de una partida (versión 3, un bloque, y versión 4, dos bloques: el tamaño
 *    del enlace de producción), que un lector independiente (jsQR 1.4.0, instalado aparte,
 *    fuera del proyecto) decodificó bien el 2026-11-19, igual que otros 54 casos (todas las máscaras, versiones 1 a 10,
 *    UTF-8). ⛔ Si esto falla, NO se regenera el golden para callarlo: se averigua qué cambió en el codificador.
 * 3. La estructura: los tres buscadores, los patrones de sincronía y el tamaño de cada versión.
 */
import { describe, expect, it } from "vitest";
import {
  bitsDeFormato,
  bitsDeVersion,
  capacidadEnBytes,
  codificarQr,
  posicionesDeAlineacion,
  reedSolomon,
} from "./qr";

const aTexto = (m: boolean[][]) => m.map((f) => f.map((c) => (c ? "#" : ".")).join(""));

describe("los vectores de la norma", () => {
  it("bits de formato del nivel M para las 8 máscaras", () => {
    const esperados = [
      "101010000010010",
      "101000100100101",
      "101111001111100",
      "101101101001011",
      "100010111111001",
      "100000011001110",
      "100111110010111",
      "100101010100000",
    ];
    esperados.forEach((bits, mascara) => {
      expect(bitsDeFormato(mascara).toString(2).padStart(15, "0"), `máscara ${mascara}`).toBe(bits);
    });
  });

  it("bits de versión 7 a 10", () => {
    expect(bitsDeVersion(7).toString(2).padStart(18, "0")).toBe("000111110010010100");
    expect(bitsDeVersion(8).toString(2).padStart(18, "0")).toBe("001000010110111100");
    expect(bitsDeVersion(9).toString(2).padStart(18, "0")).toBe("001001101010011001");
    expect(bitsDeVersion(10).toString(2).padStart(18, "0")).toBe("001010010011010011");
  });

  it("Reed-Solomon del ejemplo HELLO WORLD 1-M", () => {
    const datos = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(reedSolomon(datos, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it("los centros de alineación", () => {
    expect(posicionesDeAlineacion(1)).toEqual([]);
    expect(posicionesDeAlineacion(2)).toEqual([6, 18]);
    expect(posicionesDeAlineacion(7)).toEqual([6, 22, 38]);
    expect(posicionesDeAlineacion(10)).toEqual([6, 28, 50]);
  });
});

describe("el QR de una partida", () => {
  it("coincide con el golden que decodificó un lector independiente", () => {
    expect(aTexto(codificarQr("http://localhost:3005/trivia/play/K7M2QX"))).toEqual([
      "#######.##.###.##..##.#######",
      "#.....#.#..#....###...#.....#",
      "#.###.#...##.###....#.#.###.#",
      "#.###.#.#.####.###.#..#.###.#",
      "#.###.#..#.....#.####.#.###.#",
      "#.....#..##.#....#.##.#.....#",
      "#######.#.#.#.#.#.#.#.#######",
      "........##....##.#...........",
      "#.##.###.#.#.########.#..#.##",
      "..##.#.###....######.####...#",
      ".#######...##.#.##..#.##..##.",
      "##..##..####.###..##..####..#",
      "###...#.#.###.#..#..#....##..",
      "..#.##..##.###.#.####.#....##",
      ".....####.#..#...###.#.#.####",
      "#.####.........#..#...#.#..#.",
      "###..##.#...#.###.#..#.##..#.",
      ".#.#.#.##.##...#.#...#.#..##.",
      "#..#..##...#.####.#.##.#.##..",
      "...#.#....#.###..#######..#..",
      ".##.###.###..##.###########..",
      "........##.##...#.###...#####",
      "#######.##..#.#..#.##.#.##.#.",
      "#.....#.####.##...###...#...#",
      "#.###.#....##....##.#####.###",
      "#.###.#.#.#.##.##....#.###..#",
      "#.###.#.#.###.#.######.#.#..#",
      "#.....#..#....##...##..#.#.#.",
      "#######.####.#..#.#.#...#..#.",
    ]);
  });

  it("el del tamaño de la dirección de producción (47 bytes: versión 4, DOS bloques intercalados) también", () => {
    // Misma longitud que el enlace real de una partida en producción: ejercita el intercalado de bloques, que la
    // versión 3 de arriba no tiene. Decodificado por jsQR el 2026-11-20.
    expect(aTexto(codificarQr("https://nexus.ejemplo.test/trivia/play/K7M2QX/a"))).toEqual([
      "#######.###.###..##.#.#.#.#######",
      "#.....#.##..###...##......#.....#",
      "#.###.#.#######.#...#####.#.###.#",
      "#.###.#...#.#.#.#.#####...#.###.#",
      "#.###.#.#.#.##.##......#..#.###.#",
      "#.....#........##..#.#.#..#.....#",
      "#######.#.#.#.#.#.#.#.#.#.#######",
      ".........#..##.##.#.....#........",
      "#..######.##..#..#.......#..#.###",
      ".....#......##.#.#.#.###....###..",
      ".#.#..#.####.#.#....#.##.#..###.#",
      "#..##..#######....#.#..#.###..##.",
      "##...#####...#.#.#.....#..##...##",
      "...#.#...#.#.##...###....##..#...",
      "..###.#.#...#..#...###..#.#.##...",
      ".#..#...#.#..##.#.#.#..###...##.#",
      "##.#.####.##.#.##...#.##.####....",
      "#.#..#...#..#..#.####.#...#.#.#.#",
      "##.#.###...#..##.#########.#.##.#",
      "#..###.#..#..####..##.#.#...###.#",
      "##.#.##.#.#.....#.##.###.#...#.##",
      "#....#.....#.##......#####.##.#..",
      "#.#.###.##..##...#.##..#.#...####",
      "#.####.##......#.#.##.##..#.#.###",
      "###.####.###....#.......######...",
      "........#.#.##.#.#...#.##...#.##.",
      "#######.##...#####.##..##.#.#.#..",
      "#.....#.#####.#..##..####...###..",
      "#.###.#.###.######.#.########..##",
      "#.###.#.#.#.....###...#.##.#....#",
      "#.###.#..##.#.##..##.#..##.######",
      "#.....#..#...#.....##.#.#.#######",
      "#######.###..#.#.#.#...##.###....",
    ]);
  });

  it("elige la versión más chica que alcanza y crece con el texto", () => {
    expect(codificarQr("A")).toHaveLength(21); // versión 1
    expect(codificarQr("x".repeat(capacidadEnBytes(1)))).toHaveLength(21);
    expect(codificarQr("x".repeat(capacidadEnBytes(1) + 1))).toHaveLength(25); // versión 2
    expect(codificarQr("x".repeat(capacidadEnBytes(10)))).toHaveLength(57); // versión 10
  });

  it("un texto que no entra en la versión 10 avisa en vez de dibujar algo ilegible", () => {
    expect(() => codificarQr("x".repeat(capacidadEnBytes(10) + 1))).toThrow(/no entra/);
  });

  it("lleva los tres buscadores y los patrones de sincronía", () => {
    const m = codificarQr("https://ejemplo.test/trivia/play/ABC234");
    const n = m.length;
    const buscador = ["#######", "#.....#", "#.###.#", "#.###.#", "#.###.#", "#.....#", "#######"];
    const recorte = (x0: number, y0: number) => m.slice(y0, y0 + 7).map((f) => aTexto([f.slice(x0, x0 + 7)])[0]);
    expect(recorte(0, 0)).toEqual(buscador);
    expect(recorte(n - 7, 0)).toEqual(buscador);
    expect(recorte(0, n - 7)).toEqual(buscador);
    for (let i = 8; i < n - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
    expect(m[n - 8][8]).toBe(true); // el módulo oscuro fijo
  });
});
