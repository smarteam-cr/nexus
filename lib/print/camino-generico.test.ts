/**
 * lib/print/camino-generico.test.ts — nadie cae al camino genérico a imprimir una hoja vacía.
 *
 * ── EL BUG QUE HABRÍA CAZADO ─────────────────────────────────────────────────
 * El botón "Exportar PDF" tiene dos caminos: si la pieza está en el registro de impresión,
 * baja el documento del motor; si no, enlaza a `/print/canvas/**`. Ese segundo camino tiene
 * exactamente DOS fuentes de contenido —`CanvasSection`/`CanvasBlock` y las `ClientContextCard`
 * del pseudo-«Resumen»— y no hay una tercera.
 *
 * El Cronograma no está en ninguna de las dos: su contenido vive en `ProjectTimeline`, y su
 * definición de canvas declara `sections: []` A PROPÓSITO. O sea que cada vez que alguien le
 * daba a exportar recibía el encabezado correcto y el cuerpo con "Este canvas aún no tiene
 * contenido para exportar". No en un proyecto: en TODOS, desde siempre. Nada lo señalaba —
 * ni un error, ni un log; el PDF salía, solo que vacío.
 *
 * ── EL CRITERIO ──────────────────────────────────────────────────────────────
 * Toda pieza de proyecto que NO resuelva en el registro de impresión tiene que tener al
 * menos una sección en su definición de canvas. Sin documento propio y sin secciones, la
 * hoja vacía no es una posibilidad: es lo único que puede pasar.
 *
 * Entrar a `EXENTAS` es una decisión, no un atajo — se escribe el motivo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PIECES } from "@/lib/pieces/registry";
import { printDocForPiece } from "./doc-types";
import { DEFAULT_PROJECT_CANVASES, HANDOFF_CANVAS, BUSINESS_CASE_CANVAS } from "@/lib/canvas/canvas-defs";

/** Todas las definiciones de canvas que existen, indexadas por slug. */
const DEFS_POR_SLUG = new Map(
  [...DEFAULT_PROJECT_CANVASES, HANDOFF_CANVAS, BUSINESS_CASE_CANVAS].map((d) => [d.slug, d]),
);

/** Exentas, CON MOTIVO. */
const EXENTAS: Record<string, string> = {
  // No es una pieza de proyecto: cuelga del proyecto centinela `__strategy__` y sus secciones
  // las siembra `lib/canvas/strategy-project.ts`, no `canvas-defs.ts`. Sí tiene bloques, y de
  // hecho su PDF sale bien — con el enlace propio de ClientInfoPanel.
  "client-info": "scope de cliente; sus secciones las siembra strategy-project.ts",
  // Imprime por su propio tipo del registro (`business-case`), pero con el id del BusinessCase
  // y no el del proyecto — por eso `printDocForPiece` no la resuelve.
  "business-case": "tiene documento propio, indexado por businessCaseId y no por pieceSlug",
};

describe("ninguna pieza cae al camino genérico sin contenido que imprimir", () => {
  const enCaminoGenerico = PIECES.filter(
    (p) => p.scope === "project" && !printDocForPiece(p.slug) && !EXENTAS[p.slug],
  );

  it("las que caen ahí tienen secciones de canvas de dónde leer", () => {
    const huecas = enCaminoGenerico
      .filter((p) => (DEFS_POR_SLUG.get(p.slug)?.sections.length ?? 0) === 0)
      .map((p) => `${p.slug} (${p.label})`);
    expect(
      huecas,
      "Estas piezas exportan una hoja vacía SIEMPRE: no tienen documento en " +
        "lib/print/doc-types.ts y su canvas no tiene secciones, que son las dos únicas " +
        "fuentes de contenido que existen. Dales un documento propio (con su entrada en el " +
        "registro) o sumalas a EXENTAS con el motivo escrito:\n" + huecas.join("\n"),
    ).toEqual([]);
  });

  it("la lista no está vacía — si lo estuviera, esta guarda dejó de mirar algo", () => {
    /* Meta-aserción: el día que TODA pieza tenga documento propio, el filtro de arriba se
       vuelve trivialmente verde y deja de proteger. Que falle y se relea. */
    expect(enCaminoGenerico.length).toBeGreaterThan(0);
  });

  it("la pantalla que se está evitando sigue diciendo lo mismo", () => {
    /* Ancla del modo de falla: si alguien cambia el texto, que este test lo traiga de vuelta
       a leer POR QUÉ existe, en vez de dejarlo como una comprobación abstracta. */
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/print/canvas/[clientId]/[canvasId]/PrintClient.tsx"),
      "utf8",
    );
    expect(src).toContain("Este canvas aún no tiene contenido para exportar");
  });
});
