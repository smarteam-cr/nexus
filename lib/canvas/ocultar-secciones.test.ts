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
  /* Una ruta que guarda y nadie llama es una promesa vacía.
     ⭐ Desde el 2026-08-21 están los SEIS documentos de proyecto que pasan por el motor. Elías
     pidió que modificar el motor de páginas web «sea igual en todas las áreas», y ocultar estaba
     en dos de seis: un chat uniforme sobre un motor desparejo no se puede construir. */
  const CABLEADOS = [
    "components/canvas/ImplementacionWorkspace.tsx",
    /* Entrega ya estaba cableada desde EN-0 y nadie lo guardaba: el ojo se podía desconectar
       sin que ningún test lo notara, y es el ÚNICO documento donde ocultar tiene consecuencia
       externa — `lib/external/entrega-view.ts` filtra lo oculto contra el Json vivo, así que
       tapar una sección después de publicar la saca del enlace del cliente al instante. */
    "components/canvas/EntregaWorkspace.tsx",
    /* ⚠ Éste NO se podía cablear hasta tapar su vista externa, y este mismo archivo lo tenía
       anotado como el motivo de la deuda. Ver el describe de abajo. */
    "components/canvas/DesarrolloWorkspace.tsx",
    /* Los tres internos: su única superficie además del editor es el PDF, y la rama genérica
       de `lib/print/load-doc.ts` ya lee `hiddenKeysFrom` — su comentario dice, textual, que se
       leen las dos fuentes «así el día que un tipo estrene visibilidad no hay que acordarse de
       este archivo». Ese día es hoy y el archivo no se tocó. */
    "components/canvas/DiagnosticoWorkspace.tsx",
    "components/canvas/PlanificacionWorkspace.tsx",
    "components/canvas/ExploracionWorkspace.tsx",
  ];

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

  it("⛔ y la vista del DEV filtra lo oculto — el ojo no puede mentir hacia afuera", () => {
    /* ⚠ ESTE ES EL MOTIVO POR EL QUE `DesarrolloWorkspace` estuvo sin cablear, y quedó escrito
       acá cuando era deuda: `lib/external/desarrollo-view.ts` no leía NINGUNA fuente de oculta.
       Encender el ojo sin taparlo primero hace que el CSE apague una sección, la vea desaparecer
       de su pantalla, y **el desarrollador la siga viendo en su enlace** — un control que miente
       justo en la dirección que importa: se usa para sacar algo que no se quería mostrar.

       La edición que la pone en rojo: sacar el `.filter((s) => !ocultas.has(s.key))` del chokepoint. */
    const src = leer("lib/external/desarrollo-view.ts");
    expect(src, "el chokepoint del dev dejó de leer qué secciones están ocultas").toContain(
      "hiddenKeysFrom(canvas.sections)",
    );
    const i = src.indexOf("rows: sections");
    expect(i, "desapareció el armado de las filas que ve el dev").toBeGreaterThan(-1);
    const filas = src.slice(i, src.indexOf("})),", i));
    expect(filas.length, "la guarda no está mirando nada").toBeGreaterThan(40);
    expect(
      filas.includes("!ocultas.has(s.key)"),
      "las filas volvieron a salir sin filtrar: el dev ve lo que el CSE ocultó",
    ).toBe(true);
  });

  it("⚠ el kickoff queda aparte, y no es un olvido", () => {
    /* Tiene su PROPIO mecanismo (`Project.hiddenKickoffKeys`), indexado por ID de sección y no
       por key, y *staged*: vive en el navegador hasta «Subir al cliente». Meterlo en CABLEADOS
       exigiría que este test afirmara sobre un helper que el kickoff no usa. Unificar los dos
       mecanismos es tanda propia — lo que NO se puede es que un ejecutor de operaciones asuma que
       hay una sola puerta: en el kickoff escribiría en la que nadie lee. */
    const src = leer("components/canvas/KickoffWorkspace.tsx");
    expect(src, "el kickoff dejó de tener su propio toggle").toContain("onToggleHidden");
    expect(
      leer("app/api/projects/[projectId]/kickoff-visibility/route.ts"),
      "desapareció la columna propia del kickoff: revisar si ya se puede unificar",
    ).toContain("hiddenKickoffKeys");
  });
});
