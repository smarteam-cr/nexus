/**
 * lib/canvas/crear-seccion.test.ts — CREAR Y BORRAR UNA SECCIÓN PROPIA, IGUAL EN TODOS LOS
 * DOCUMENTOS DEL MOTOR.
 *
 * Correr: `npx vitest run lib/canvas/crear-seccion.test.ts --project unit`.
 *
 * ── QUÉ PROTEGE ───────────────────────────────────────────────────────────────────────────────
 * Hasta el 2026-08-21 crear una sección existía en UNO de los ocho documentos (la propuesta
 * comercial). Elías pidió que modificar el motor de páginas web «sea igual en todas las áreas»:
 * mientras la capacidad esté en un solo lugar, cualquier cosa que se construya encima —el chat, el
 * botón de la sección— significa algo distinto según dónde estés parado.
 *
 * Los dos modos de falla que estas guardas cazan, los dos silenciosos:
 *   1. **Nace una sección sin su bloque.** Todo el motor asume UN bloque `CARD` por sección: sin
 *      él la sección se ve, se escribe, y no guarda nada.
 *   2. **Se borra una sección de la PLANTILLA.** Un DELETE sin candado deja borrar la portada o el
 *      cierre de un kickoff, y el documento queda mutilado sin más salida que regenerarlo entero.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const COLECCION = "app/api/projects/[projectId]/canvas-sections/route.ts";
const UNA = "app/api/projects/[projectId]/canvas-sections/[sectionId]/route.ts";
const COLECCION_BC = "app/api/business-cases/[id]/canvas-sections/route.ts";
const UNA_BC = "app/api/business-cases/[id]/canvas-sections/[sectionId]/route.ts";

/** Los dos caminos por los que puede nacer una sección fuera del sembrado del canvas. */
const CREADORES = [
  ["proyecto", COLECCION],
  ["business case", COLECCION_BC],
] as const;

const BORRADORES = [
  ["proyecto", UNA],
  ["business case", UNA_BC],
] as const;

describe("⭐ crear una sección existe en los dos mundos, y hace lo mismo", () => {
  for (const [mundo, ruta] of CREADORES) {
    it(`${mundo}: el POST siembra la fila, el bloque y la entry — en UNA transacción`, () => {
      /* La edición que la pone en rojo: sacar el `canvasBlock.create` del POST. La sección
         nacería sin bloque: se ve, se edita, y al recargar no quedó nada. */
      const src = leer(ruta);
      const i = src.indexOf("export async function POST");
      expect(i, `${mundo} se quedó sin POST: crear una sección dejó de existir ahí`).toBeGreaterThan(-1);
      const post = src.slice(i);
      expect(post.length, "la guarda no está mirando nada").toBeGreaterThan(400);

      expect(post.includes("$transaction"), `${mundo}: las tres escrituras dejaron de ser atómicas`).toBe(true);
      expect(post.includes("canvasSection.create"), `${mundo}: no crea la fila`).toBe(true);
      expect(post.includes("canvasBlock.create"), `${mundo}: la sección nace SIN bloque — se ve y no guarda`).toBe(true);
      expect(post.includes("patchSectionEntry"), `${mundo}: no escribe la entry del Json, de donde salen el ojo y el orden`).toBe(true);
    });

    it(`${mundo}: escribe titleOverride además de label — es lo único que llega al PDF`, () => {
      /* `PrintRow` no lleva `label`, así que el nombre que escribió la persona llega a la
         impresión SOLO por `titleOverride`. Sin él, la sección sale en el PDF con el rótulo
         genérico y nadie entiende por qué.
         La edición que la pone en rojo: borrar `titleOverride: label` del create. */
      const src = leer(ruta);
      const post = src.slice(src.indexOf("export async function POST"));
      expect(
        post.includes("titleOverride: label"),
        `${mundo}: el nombre de la sección dejó de cruzar al PDF`,
      ).toBe(true);
    });

    it(`${mundo}: hay un techo de secciones propias`, () => {
      /* No es estética: el GET devuelve TODOS los bloques con su `data` y el hook los serializa
         enteros en cada refetch. */
      expect(leer(ruta)).toContain("MAX_CUSTOM_SECTIONS");
    });
  }
});

describe("⛔ borrar alcanza SOLO a las secciones propias", () => {
  for (const [mundo, ruta] of BORRADORES) {
    it(`${mundo}: el DELETE rechaza una key de plantilla`, () => {
      /* ⛔ ES EL CANDADO MÁS IMPORTANTE DE LOS DOS HANDLERS. Sin él se puede borrar la portada o
         el cierre de un documento, y no hay reconciliador que las devuelva.
         La edición que la pone en rojo: sacar el `if (!esCustomKey(...))` del DELETE. */
      const src = leer(ruta);
      const i = src.indexOf("export async function DELETE");
      expect(i, `${mundo} se quedó sin DELETE`).toBeGreaterThan(-1);
      const del = src.slice(i);
      expect(del.length, "la guarda no está mirando nada").toBeGreaterThan(300);
      expect(
        del.includes("esCustomKey(section.key)"),
        `${mundo}: el DELETE quedó genérico — se puede borrar una sección de la plantilla`,
      ).toBe(true);
    });
  }

  it("⚠ y el de PROYECTO respeta el veto del handoff, como el resto de sus verbos", () => {
    /* El handoff es el único documento de proyecto donde editar exige una capacidad propia. Un
       verbo nuevo que no lo consulte abre una puerta lateral a un documento que un CSE no puede
       tocar por las otras.
       La edición que la pone en rojo: sacar `denyHandoffCanvasEditForCse` del POST o del DELETE. */
    for (const [verbo, ruta] of [
      ["POST", COLECCION],
      ["DELETE", UNA],
    ] as const) {
      const src = leer(ruta);
      const cuerpo = src.slice(src.indexOf(`export async function ${verbo}`));
      expect(
        cuerpo.includes("denyHandoffCanvasEditForCse"),
        `el ${verbo} de proyecto dejó de consultar el veto del handoff`,
      ).toBe(true);
    }
  });
});
