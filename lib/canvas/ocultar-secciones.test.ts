/**
 * lib/canvas/ocultar-secciones.test.ts — el ojo del editor SOBREVIVE al reload.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Hasta el 2026-08-12 ocultar una sección **no funcionaba en ningún canvas de PROYECTO**, y
 * fallaba en dos lugares distintos, los dos callados:
 *
 *  1. El PATCH de `app/api/projects/[projectId]/canvas-sections/[sectionId]` no tenía rama
 *     `hidden`: un `{hidden:true}` caía al `"nothing to update"` y devolvía **400**. El motor
 *     (`LandingView`) y el hook (`useCanvasSections`) ya lo soportaban enteros — o sea que el
 *     ojo se pintaba, se podía clickear, y no guardaba nada.
 *  2. El GET no devolvía `hidden` (no es una columna: vive en el Json del canvas). Aunque el
 *     PATCH guardara, al recargar la sección volvía a estar visible.
 *
 * El (2) es el peligroso: el CSE oculta algo, ve que se oculta, publica, y el cliente lo ve.
 * Un fallo que se corrige solo en pantalla es indistinguible de que funcione.
 *
 * ── POR QUÉ EL JSON Y NO UNA COLUMNA ─────────────────────────────────────────
 * `ProjectCanvas.sections` con los helpers de `lib/business-cases/section-briefs.ts` (el
 * nombre del archivo engaña: son genéricos y no saben nada de business cases). Así
 * `lib/print/load-doc.ts` —que YA lee `hiddenKeysFrom` en su rama genérica de piezas de
 * proyecto— respeta lo oculto sin una línea nueva. Una columna sería una TERCERA fuente de
 * «oculta», que es exactamente lo que `lib/print/print-visibilidad.test.ts` documenta como
 * «la parte que se olvida».
 *
 * fs-scan, como el resto de las guardas del repo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Las dos puntas del viaje de ida y vuelta. Si una falta, la otra no alcanza. */
const PATCH_RUTA = "app/api/projects/[projectId]/canvas-sections/[sectionId]/route.ts";
const GET_RUTA = "app/api/projects/[projectId]/canvas-sections/route.ts";

describe("ocultar una sección de un canvas de proyecto se GUARDA", () => {
  it("el PATCH tiene la rama `hidden`", () => {
    const src = leer(PATCH_RUTA);
    expect(
      src,
      "sin esta rama un {hidden:true} cae al «nothing to update» y devuelve 400: el ojo se " +
        "clickea y no pasa nada.",
    ).toMatch(/if\s*\(\s*"hidden"\s+in\s+body\s*\)/);
  });

  it("escribe por el helper genérico, no editando el Json a mano", () => {
    const src = leer(PATCH_RUTA);
    expect(
      src,
      "el Json de secciones se toca SOLO por `patchSectionEntry`: es lo que conserva el brief " +
        "y el `previousBrief` de esa misma sección. Un `sections: [...]` armado a mano los pisa.",
    ).toContain("patchSectionEntry(");
  });

  it("marca el canvas como «con cambios sin subir»", () => {
    /* `touchCanvasContent` es lo que enciende `contentUpdatedAt > publishedSnapshotAt`. Con
       publicación por snapshot, ocultar algo TIENE que pedir re-publicar; sin esto el CSE tapa
       una sección y el enlace del cliente la sigue mostrando hasta la próxima publicación. */
    const src = leer(PATCH_RUTA);
    const rama = src.slice(src.search(/if\s*\(\s*"hidden"\s+in\s+body\s*\)/));
    const finDeRama = rama.indexOf("return NextResponse.json({ id: section.id, hidden })");
    expect(finDeRama, "no encontré el cierre de la rama `hidden`").toBeGreaterThan(0);
    expect(
      rama.slice(0, finDeRama),
      "la rama `hidden` no llama a touchCanvasContent — el documento publicado no se entera",
    ).toContain("touchCanvasContent(");
  });
});

describe("…y SOBREVIVE al reload", () => {
  it("el GET hidrata `hidden` desde el Json del canvas", () => {
    const src = leer(GET_RUTA);
    expect(
      src,
      "`hidden` no es una columna: si el GET no lo re-adjunta por key, el ojo cambia en " +
        "pantalla, se recarga, y la sección vuelve a estar visible. El arreglo se apaga en el " +
        "último metro y nadie se entera.",
    ).toContain("parseSectionEntries(");
    expect(src, "el GET carga el Json pero no lo devuelve por sección").toMatch(
      /hidden:\s*ocultaPorKey\.get\(/,
    );
  });

  it("el GET pide `sections` en el select del canvas", () => {
    /* Sin esto `parseSectionEntries` recibe `undefined` y devuelve [] — o sea que TODO queda
       visible, en silencio y sin error de tipos, porque el helper tolera basura a propósito. */
    const src = leer(GET_RUTA);
    const select = src.slice(src.indexOf("prisma.projectCanvas.findUnique"));
    expect(select.slice(0, 300)).toContain("sections: true");
  });
});

describe("el editor lo usa de verdad", () => {
  /* Una ruta que guarda y nadie llama es una promesa vacía. Implementación es el primer
     workspace de proyecto cableado; el día que se cableen los otros, entran acá. */
  const CABLEADOS = ["components/canvas/ImplementacionWorkspace.tsx"];

  for (const rel of CABLEADOS) {
    it(`${rel} pasa onToggleHidden y refleja \`hidden\` en las secciones`, () => {
      const src = leer(rel);
      expect(src, "el motor pinta el ojo pero nadie escucha el click").toContain("onToggleHidden=");
      expect(
        src,
        "sin pasar `hidden` a LandingView el ojo nace siempre apagado, aunque la base diga otra cosa",
      ).toMatch(/hidden:\s*s\.hidden\s*===\s*true/);
    });
  }

  it("⚠ los workspaces SIN cablear están declarados con su motivo", () => {
    /* Deuda con motivo, no omisión. `lib/external/desarrollo-view.ts` (89 líneas) no lee
       NINGUNA fuente de oculta: encender el ojo ahí sin taparlo primero haría que el CSE
       oculte una sección y el desarrollador la siga viendo en su enlace. Los otros tres son
       documentos internos sin vista externa: entran cuando alguien los pida. */
    const PENDIENTES: Record<string, string> = {
      "components/canvas/DesarrolloWorkspace.tsx":
        "lib/external/desarrollo-view.ts no filtra lo oculto — cablearlo abriría una fuga",
      "components/canvas/DiagnosticoWorkspace.tsx": "interno, sin pedido",
      "components/canvas/ExploracionWorkspace.tsx": "interno, sin pedido",
      "components/canvas/PlanificacionWorkspace.tsx": "interno, sin pedido",
    };
    for (const [rel, motivo] of Object.entries(PENDIENTES)) {
      expect(motivo.length, `${rel} está en la lista sin motivo escrito`).toBeGreaterThan(10);
      // Ratchet: el día que uno se cablee, sale de acá y entra a CABLEADOS.
      expect(
        leer(rel).includes("onToggleHidden="),
        `${rel} YA cablea onToggleHidden: sacalo de PENDIENTES y agregalo a CABLEADOS`,
      ).toBe(false);
    }
  });
});
