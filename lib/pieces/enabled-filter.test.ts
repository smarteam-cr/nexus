/**
 * lib/pieces/enabled-filter.test.ts — CANDADO de la regla dura de "pieza apagada".
 *
 * La regla, en una línea: **el filtro de apagada va en los LISTADOS, nunca en las
 * consultas de EXISTENCIA.**
 *
 * Y el motivo no es de estilo. Los dos `ensure*Canvas` son find-or-CREATE: si la
 * consulta con la que buscan no viera la pieza apagada, cada regeneración del handoff
 * crearía un canvas DUPLICADO y dejaría huérfano el contenido viejo (además de chocar
 * contra el índice único parcial y reventar). El gate de permisos tiene una variante
 * igual de fea: pregunta "¿ya existe el artefacto?" para decidir entre `generate` y
 * `regenerate`, así que una pieza apagada leída como inexistente convertiría un
 * "regenerar" en un "generar" y **saltearía la celda que protege pisar contenido**.
 *
 * Agregar `disabledAt` en esos archivos parece lo correcto — por eso hace falta un test
 * que lo frene, y no un comentario.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** Solo CÓDIGO: los encabezados de estos archivos explican la regla y la nombran. */
const codigoDe = (rel: string) =>
  leer(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Las dos lecturas que le arman al CSE la lista de piezas del proyecto. */
const LISTADOS = [
  "app/(shell)/clients/[id]/page.tsx",
  "app/api/projects/[projectId]/canvases/route.ts",
];

/** Consultas de EXISTENCIA: acá el filtro haría daño, no bien. */
const EXISTENCIA: Array<{ archivo: string; porque: string }> = [
  {
    archivo: "lib/canvas/desarrollo-generate.ts",
    porque: "es find-or-CREATE: filtrar crearía un canvas duplicado y dejaría huérfano el contenido",
  },
  {
    archivo: "lib/canvas/exploracion-generate.ts",
    porque: "es find-or-CREATE: filtrar crearía un canvas duplicado y dejaría huérfano el contenido",
  },
  {
    archivo: "lib/auth/permissions/artifact-gate.ts",
    porque:
      "decide generate vs regenerate por existencia: una pieza apagada leída como inexistente " +
      "saltearía la celda de permiso que protege pisar contenido",
  },
  {
    archivo: "lib/canvas/load-canvas-context.ts",
    porque:
      "es el contexto de 8 agentes: el contenido de una pieza apagada sigue siendo cierto, " +
      "esconderlo degrada otras generaciones sin que nadie lo haya pedido",
  },
];

describe("las dos lecturas de la lista filtran las piezas apagadas", () => {
  for (const rel of LISTADOS) {
    it(`${rel} usa onlyEnabled`, () => {
      expect(
        codigoDe(rel).includes("onlyEnabled"),
        `${rel} dejó de filtrar las piezas apagadas. Tienen que filtrar LAS DOS: el panel las ` +
          "mezcla en un solo estado, y con una sola la pantalla arranca con N pestañas y salta a N−1.",
      ).toBe(true);
    });
  }
});

describe("el filtro NO entra en las consultas de existencia", () => {
  for (const { archivo, porque } of EXISTENCIA) {
    it(`${archivo} no mira disabledAt`, () => {
      const codigo = codigoDe(archivo);
      for (const señal of ["onlyEnabled", "disabledAt"]) {
        expect(
          codigo.includes(señal),
          `${archivo} empezó a mirar "${señal}" — ${porque}. El estado de la pieza se chequea ` +
            "en el BORDE (el endpoint que dispara al agente), no dentro de la consulta.",
        ).toBe(false);
      }
    });
  }
});

describe("los ayudantes de existencia siguen limpios", () => {
  it("canvasOf / canvasOfNested / canvasOfAny no filtran por estado", () => {
    const src = leer("lib/pieces/canvas-query.ts");
    // Se corta el archivo justo antes de donde vive `onlyEnabled`: lo de arriba es
    // existencia y no puede mencionar el estado.
    const existencia = src.slice(0, src.indexOf("export const onlyEnabled"));
    expect(
      existencia.includes("disabledAt"),
      "un helper de EXISTENCIA empezó a filtrar por disabledAt: los find-or-create que lo usan " +
        "crearían canvases duplicados.",
    ).toBe(false);
  });
});
