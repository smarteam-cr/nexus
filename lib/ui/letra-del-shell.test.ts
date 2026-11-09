/**
 * lib/ui/letra-del-shell.test.ts — la letra de las pantallas internas (DECISIONS › «Letra de las pantallas internas»).
 *
 * En las pantallas internas los tamaños fijos (`text-[9px]` … `text-[15.5px]`) suben un punto desde app/globals.css,
 * sin tocar los componentes. Esto vigila que la regla siga cumpliendo lo que promete:
 *
 * L1 · cada tamaño sube exactamente uno, y su interlineado fijo también.
 * L2 · nunca alcanza un documento del cliente: cada regla excluye las raíces del motor de documentos, y esas
 *      raíces siguen existiendo con ese nombre (si una se renombra, la exclusión moriría en silencio).
 * L3 · la marca `data-nx-shell` la pone SOLO el layout del shell interno: ni el cliente, ni el PDF, ni el login.
 * L4 · ningún literal combina un tamaño que sube con otro tamaño con variante (`md:text-sm`) o con `!`: la regla
 *      tiene la especificidad de la utilidad y viene después, así que se los comería. NO ve las clases que se
 *      arman en `cn()` a partir de varios literales ni las que llegan por prop: eso queda al ojo.
 * L5 · toda variante arbitraria con un tamaño que sube (`[&>button]:text-[12.5px]`) tiene su regla: su
 *      especificidad le gana a la general y se quedaría chica.
 * L6 · la cabecera de semanas del Gantt deja sus fechas en 9 px, y el Gantt conserva la forma que esa regla espera.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, listarTsx } from "./scan-source";

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8").replace(/\r\n/g, "\n");

/** app/** + components/**, leídos UNA vez para L3 a L5 (son unos 1.500 archivos). */
let fuentes: Array<[string, string]> | null = null;
const todasLasFuentes = () =>
  (fuentes ??= [...listarTsx("app"), ...listarTsx("components")].map((f): [string, string] => [f, leer(f)]));
/** Recorrer el árbol tarda ~1 s con la máquina libre; con otras sesiones compilando, más de 5. */
const ESCANEO = 60_000;

const GLOBALS = leer("app/globals.css");
const INICIO = GLOBALS.indexOf("Letra de las pantallas internas");
const BLOQUE = GLOBALS.slice(GLOBALS.indexOf("@layer utilities {", INICIO), GLOBALS.indexOf("\n}\n", INICIO) + 2);

const SUBE: Array<[string, string]> = [
  ["9", "10"],
  ["10", "11"],
  ["10.5", "11.5"],
  ["11", "12"],
  ["11.5", "12.5"],
  ["12", "13"],
  ["12.5", "13.5"],
  ["13", "14"],
  ["13.5", "14.5"],
  ["14", "15"],
  ["14.5", "15.5"],
  ["15", "16"],
  ["15.5", "16.5"],
];
const INTERLINEADO: Array<[string, string]> = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map((n) => [String(n), String(n + 1)]);
const TAMANO_QUE_SUBE = "(9|10|10\\.5|11|11\\.5|12|12\\.5|13|13\\.5|14|14\\.5|15|15\\.5)";

/** Raíz del documento del cliente → la hoja que la define. */
const RAICES: Array<[string, string]> = [
  [".stl", "app/landing-engine.css"],
  [".kickoff-landing", "app/kickoff-landing.css"],
  [".rde", "components/escala/radar-de-una-empresa.css"],
  [".dr", "components/external/test/diagnostico.css"],
  [".cp-root", "app/globals.css"],
];

const escapar = (n: string) => n.replace(".", "\\\\\\.");
const MARCA = ":where(html:has([data-nx-shell]))";
/** Las reglas que SUBEN (la que deja en 9 px la cabecera del Gantt vive dentro de una pantalla interna). */
const reglas = () => BLOQUE.split("\n").filter((l) => l.includes(MARCA) && !l.includes("cronograma.gantt"));

describe("letra de las pantallas internas", () => {
  it("L1 · cada tamaño fijo sube exactamente un punto, con su interlineado", () => {
    expect(BLOQUE.length).toBeGreaterThan(200);
    expect(BLOQUE).not.toContain("!important");
    for (const [antes, despues] of SUBE) {
      const re = new RegExp(`\\s\\.text-\\\\\\[${escapar(antes)}px\\\\\\]:where[^{]*\\{ font-size: ${despues.replace(".", "\\.")}px; \\}`);
      expect(BLOQUE, `text-[${antes}px] → ${despues}px`).toMatch(re);
    }
    for (const [antes, despues] of INTERLINEADO) {
      const re = new RegExp(`\\s\\.leading-\\\\\\[${antes}px\\\\\\]:where[^{]*\\{ line-height: ${despues}px; \\}`);
      expect(BLOQUE, `leading-[${antes}px] → ${despues}px`).toMatch(re);
    }
  });

  it("L2 · ninguna regla alcanza un documento del cliente, y sus raíces siguen existiendo", () => {
    const todas = reglas();
    // + lg:text-[13px] + la variante arbitraria del editor de procesos
    expect(todas.length).toBe(SUBE.length + INTERLINEADO.length + 2);
    for (const regla of todas) {
      for (const [raiz] of RAICES) expect(regla, `${raiz} excluida en: ${regla.trim().slice(0, 80)}`).toContain(raiz);
      expect(regla).toContain("[data-external-surface]");
    }
    for (const [raiz, hoja] of RAICES) {
      expect(leer(hoja), `${raiz} sigue definida en ${hoja}`).toMatch(new RegExp(`(^|\\n|,\\s*)\\${raiz}[\\s.{,]`));
    }
  });

  it("L3 · la marca del shell la pone solo el layout interno", () => {
    const conMarca = todasLasFuentes().filter(([, fuente]) => fuente.includes("data-nx-shell"));
    expect(conMarca.map(([f]) => f.split(path.sep).join("/"))).toEqual(["app/(shell)/layout.tsx"]);
  }, ESCANEO);

  it("L4 · ningún literal mezcla un tamaño que sube con otro tamaño con variante o con «!»", () => {
    const sube = new RegExp(`(^|[\\s"'\`])text-\\[${TAMANO_QUE_SUBE}px\\]`);
    const otroTamano =
      /(^|[\s"'`])([^\s"'`]+:)+!?text-(2xs|xs|sm|base|lg|xl|\d?xl|\[[\d.]+(px|rem|em)\])(?=[\s"'`]|$)|(^|[\s"'`])!text-(2xs|xs|sm|base|lg|xl|\d?xl|\[[\d.]+(px|rem|em)\])/;
    const ofensores: string[] = [];
    for (const [f, fuente] of todasLasFuentes()) {
      if (!sube.test(fuente)) continue;
      for (const m of fuente.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
        const clases = ` ${m[1]} `;
        if (sube.test(clases) && otroTamano.test(clases)) ofensores.push(`${f}: ${m[1].trim()}`);
      }
    }
    expect(ofensores).toEqual([]);
  }, ESCANEO);

  it("L5 · toda variante arbitraria con un tamaño que sube tiene su regla", () => {
    const re = new RegExp(`(\\[[^\\]\\s"'\`]+\\]):text-\\[${TAMANO_QUE_SUBE}px\\]`, "g");
    const sinRegla: string[] = [];
    for (const [f, fuente] of todasLasFuentes()) {
      if (/^(app|components)[\\/](external|landing|print)[\\/]/.test(f)) continue;
      for (const m of fuente.matchAll(re)) {
        const escapada = m[0].replace(/[[\]&>:.+~*()]/g, (c) => `\\${c}`);
        if (!BLOQUE.includes(`.${escapada}`)) sinRegla.push(`${f}: ${m[0]}`);
      }
    }
    expect(sinRegla).toEqual([]);
  }, ESCANEO);

  it("L6 · la cabecera de semanas del Gantt conserva sus 9 px", () => {
    expect(BLOQUE).toContain(
      '[data-recorrido="cronograma.gantt"] .text-center.leading-tight > .text-\\[9px\\] { font-size: 9px; }',
    );
    const gantt = leer("components/canvas/TimelineGantt.tsx");
    expect(gantt).toContain('data-recorrido="cronograma.gantt"');
    // La celda de cada semana (text-center leading-tight) con la fecha a 9 px como hija directa.
    expect(gantt).toMatch(/className=\{`text-center leading-tight[^`]*`\}\s*>\s*<div className="text-\[10px\][^"]*">S\{w\}<\/div>\s*\{anchor && <div className="text-\[9px\]/);
  });
});
