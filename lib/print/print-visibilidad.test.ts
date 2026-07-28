/**
 * lib/print/print-visibilidad.test.ts — lo oculto y lo no confirmado NO llegan al papel.
 *
 * Dos reglas, pedidas explícitamente, que valen para TODA página de impresión:
 *
 *   1. Una sección que el CSE ocultó al cliente no sale en el PDF.
 *   2. Un bloque que el agente propuso y nadie confirmó (DRAFT) tampoco.
 *
 * ── POR QUÉ HACE FALTA UNA GUARDA ────────────────────────────────────────────
 * Las dos se incumplían, y las dos en silencio:
 *
 * · `/print/canvas` no leía "oculta" de ningún lado. No se notaba porque el PDF del kickoff
 *   —el único canvas de ese camino con visibilidad por sección— salía VACÍO por otro bug.
 *   Al arreglar ese bug, el documento empezó a salir completo… incluido lo escondido. Un
 *   arreglo que abre un agujero peor que el problema que cerró.
 * · Ni esa página ni la del business case filtraban `status`, así que una propuesta en
 *   DRAFT podía irse impresa al cliente. Los otros dos consumidores del mismo contenido
 *   (publish y la vista externa del kickoff) sí lo filtraban desde siempre.
 *
 * ── LA PARTE QUE SE OLVIDA ───────────────────────────────────────────────────
 * "Oculta" tiene DOS fuentes con formas distintas, porque nacieron en módulos distintos:
 *   business case → `{key, hidden:true}` dentro del Json `ProjectCanvas.sections`
 *   kickoff       → la columna `Project.hiddenKickoffKeys`, que cuelga del PROYECTO
 * Una página que lea solo una de las dos pasa igual una revisión por encima.
 *
 * fs-scan, como el resto de las guardas del repo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

/**
 * Los DOS caminos que imprimen contenido de canvas:
 *   · el cargador del motor, que sirve a los ocho tipos de documento;
 *   · la vista imprimible genérica, para los canvas que no tienen definición en el motor.
 * No hay un tercero, y ésa es media razón de haber unificado.
 */
const FUENTES = [
  "lib/print/load-doc.ts",
  "app/print/canvas/[clientId]/[canvasId]/page.tsx",
];

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

describe("lo que el CSE ocultó no sale impreso", () => {
  for (const rel of FUENTES) {
    it(`${rel} lee LAS DOS fuentes de «oculta»`, () => {
      const src = leer(rel);
      expect(src, "falta la fuente del business case (Json de ProjectCanvas.sections)")
        .toContain("hiddenKeysFrom");
      expect(src, "falta la fuente del kickoff (columna del PROYECTO)")
        .toContain("hiddenKickoffKeys");
      // El resolvedor tiene que ser el MISMO que usa la vista del cliente: la clave del
      // kickoff es el id de la sección salvo cronograma/procesos, que van por key.
      expect(src, "la clave del kickoff se resuelve a mano en vez de reusar el helper")
        .toContain("kickoffHiddenKey");
    });

    it(`${rel} las aplica como FILTRO, no solo las carga`, () => {
      expect(leer(rel)).toMatch(/\.filter\(\s*\(s\)\s*=>\s*!ocultas/);
    });
  }

  it("el cargador gatea también el cronograma y los procesos del kickoff", () => {
    /* No salen de un CanvasBlock, así que el filtro de filas no los toca: se ocultan por su
       propia key. Sin esto, esconder el cronograma en pantalla y verlo impreso. */
    const src = leer("lib/print/load-doc.ts");
    expect(src).toMatch(/ocultasKickoff\.has\("cronograma"\)/);
    expect(src).toMatch(/ocultasKickoff\.has\("procesos"\)/);
    // Y un proceso suelto, que se oculta por su id dentro de la sección.
    expect(src).toMatch(/ocultasKickoff\.has\(p\.id\)/);
  });
});

describe("lo no confirmado tampoco", () => {
  for (const rel of FUENTES) {
    it(`${rel} filtra los bloques por status CONFIRMED`, () => {
      expect(
        leer(rel),
        "un bloque DRAFT es una propuesta que nadie aceptó — no puede irse impresa al cliente",
      ).toMatch(/status:\s*"CONFIRMED"/);
    });
  }
});
