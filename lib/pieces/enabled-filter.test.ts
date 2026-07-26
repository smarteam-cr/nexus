/**
 * lib/pieces/enabled-filter.test.ts — CANDADO de la regla dura de "pieza apagada".
 *
 * La regla, en una línea: **el filtro de apagada va en los LISTADOS, nunca en las
 * consultas de EXISTENCIA.**
 *
 * Y el motivo no es de estilo. Los cinco `ensure*Canvas` son find-or-CREATE: si la
 * consulta con la que buscan no viera la pieza apagada, cada regeneración del handoff
 * crearía un canvas DUPLICADO y dejaría huérfano el contenido viejo (además de chocar
 * contra el índice único parcial y reventar). El gate de permisos tiene una variante
 * igual de fea: pregunta "¿ya existe el artefacto?" para decidir entre `generate` y
 * `regenerate`, así que una pieza apagada leída como inexistente convertiría un
 * "regenerar" en un "generar" y **saltearía la celda que protege pisar contenido**.
 *
 * ⚠ LA EXCEPCIÓN, para que nadie la agregue acá por error: `lib/pieces/ensure-canvas.ts`
 * SÍ mira `disabledAt`, y a propósito — es el camino por el que el CSE vuelve a encender
 * una pieza desde el gestor, así que ahí el estado es lo que se está tocando, no un
 * filtro colado en una consulta de existencia.
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
  /* Los tres runners nuevos son el mismo find-or-CREATE calcado del de Exploración, así
     que corren exactamente el mismo riesgo. Faltaban en esta lista: el candado protegía
     dos de cinco puertas y las otras tres estaban abiertas. */
  {
    archivo: "lib/canvas/diagnostico-generate.ts",
    porque: "es find-or-CREATE: filtrar crearía un canvas duplicado y dejaría huérfano el contenido",
  },
  {
    archivo: "lib/canvas/planificacion-generate.ts",
    porque: "es find-or-CREATE: filtrar crearía un canvas duplicado y dejaría huérfano el contenido",
  },
  {
    archivo: "lib/canvas/implementacion-generate.ts",
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
    // Comentarios FUERA, como en el resto del archivo: el encabezado de canvas-query
    // explica qué hace y qué NO hace apagar una pieza, y para explicarlo tiene que
    // nombrar `disabledAt`. Leyendo el archivo crudo, ese párrafo hacía fallar al guard
    // — el candado se disparaba contra la documentación de la regla que protege.
    const src = codigoDe("lib/pieces/canvas-query.ts");
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
