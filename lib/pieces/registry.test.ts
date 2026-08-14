/**
 * lib/pieces/registry.test.ts — el registro de piezas.
 *
 * Lo que estos tests FIJAN: la identidad de una pieza (`slug`) y su nombre visible
 * (`label`) son cosas distintas. Renombrar una pieza tiene que ser cambiar un label
 * y nada más — si un test de acá se pone rojo al renombrar, es que el rename se
 * filtró a la identidad y va a romper datos, ruteo o permisos en producción.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PIECES,
  pieceBySlug,
  pieceByName,
  pieceByAgentGroup,
  pieceForCanvas,
  slugForCanvas,
  pieceLabel,
  piecesCreatedWithProject,
  piecesEnabledByTags,
} from "./registry";

describe("integridad del registro", () => {
  it("los slugs son únicos", () => {
    const slugs = PIECES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("los slugs son estables: inglés, minúsculas, kebab-case, sin acentos", () => {
    for (const p of PIECES) {
      expect(p.slug, `slug de ${p.label}`).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("ningún nombre visible se repite entre dos piezas", () => {
    const names = PIECES.flatMap((p) => p.legacyNames);
    expect(new Set(names).size).toBe(names.length);
  });

  it("cada agentGroup pertenece a una sola pieza", () => {
    const groups = PIECES.map((p) => p.agentGroup).filter(Boolean);
    expect(new Set(groups).size).toBe(groups.length);
  });

  it("una pieza con tags que la encienden tiene que estar marcada como opcional", () => {
    for (const p of PIECES) {
      if (p.enabledByTags.length > 0) expect(p.optional, `${p.slug}`).toBe(true);
    }
  });
});

describe("resolución de canvases YA existentes en la base", () => {
  // Los 790 canvases vivos al 2026-07-24. Si el backfill no los resuelve a todos,
  // quedan piezas huérfanas: sin agente, sin permiso y sin renderer.
  const EN_PROD: Array<[string, number]> = [
    ["Exploración", 164],
    ["Kickoff", 139],
    ["Planificación", 118],
    ["Cronograma", 118],
    ["Diagnóstico", 118],
    ["Información del cliente", 46],
    ["Handoff", 45],
    ["Desarrollo", 18],
  ];

  it("TODOS los nombres de proyecto vivos resuelven a una pieza", () => {
    const huerfanos = EN_PROD.filter(([name]) => pieceByName(name) === null);
    expect(huerfanos, `sin pieza: ${huerfanos.map(([n]) => n).join(", ")}`).toEqual([]);
  });

  it("cubre los 766 canvases de proyecto", () => {
    expect(EN_PROD.reduce((n, [, c]) => n + c, 0)).toBe(766);
  });

  it("los canvases del Business Case resuelven por businessCaseId, NO por nombre", () => {
    // Ahí `name` es la VERSIÓN ("Propuesta 1"), no la pieza — resolverlos por nombre
    // los dejaría huérfanos a los 24.
    expect(pieceByName("Propuesta 1")).toBeNull();
    expect(pieceByName("Caso de uso 2")).toBeNull();
    expect(pieceByName("Plantilla")).toBeNull();
    expect(pieceForCanvas({ name: "Propuesta 1", businessCaseId: "bc1" })?.slug).toBe("business-case");
    expect(slugForCanvas({ name: "Plantilla", businessCaseId: "bc1" })).toBe("business-case");
  });

  it("un canvas custom del CSE no resuelve, y eso NO es un error", () => {
    expect(pieceForCanvas({ name: "Mi canvas propio" })).toBeNull();
    expect(slugForCanvas({ name: "Mi canvas propio" })).toBeNull();
  });
});

describe("precedencia de resolución", () => {
  it("el slug ya poblado MANDA sobre el nombre", () => {
    // Post-renombre, el nombre en la base puede quedar viejo: el slug es la verdad.
    expect(pieceForCanvas({ slug: "tech-requirements", name: "Cualquier cosa" })?.slug).toBe(
      "tech-requirements",
    );
  });

  it("sin slug, businessCaseId gana sobre el nombre", () => {
    expect(pieceForCanvas({ name: "Kickoff", businessCaseId: "bc1" })?.slug).toBe("business-case");
  });

  it("sin slug ni businessCaseId, se cae al nombre (canvases pre-migración)", () => {
    expect(pieceForCanvas({ name: "Kickoff" })?.slug).toBe("kickoff");
  });
});

describe("renombrar es seguro: identidad ≠ nombre visible", () => {
  it("la pieza técnica se identifica por slug aunque hoy se llame «Desarrollo»", () => {
    const p = pieceBySlug("tech-requirements")!;
    expect(p.label).toBe("Desarrollo"); // F4 lo cambia a "Requerimientos técnicos"
    expect(p.legacyNames).toContain("Desarrollo"); // y el viejo NO se borra
  });

  it("el nombre viejo tiene que seguir resolviendo tras un rename", () => {
    // Simula el estado post-F4: label nuevo, legacyNames con los dos.
    const futuro = { ...pieceBySlug("tech-requirements")!, label: "Requerimientos técnicos" };
    expect(futuro.slug).toBe("tech-requirements"); // la identidad no se movió
    expect(pieceByName("Desarrollo")?.slug).toBe("tech-requirements"); // los 18 canvases siguen vivos
  });

  it("pieceLabel devuelve el slug crudo si la pieza no está registrada", () => {
    expect(pieceLabel("no-existe")).toBe("no-existe");
    expect(pieceLabel("kickoff")).toBe("Kickoff");
  });
});

describe("consultas del registro", () => {
  it("un proyecto nuevo nace con Kickoff, Cronograma y Exploración — nada más", () => {
    // Cambiar esta lista es una decisión de PRODUCTO, no un refactor: define con qué
    // se encuentra el CSE al abrir un proyecto recién creado. El test está para que el
    // cambio sea deliberado y quede escrito por qué.
    //
    // 2026-07-24 — salieron Diagnóstico y Planificación: se creaban en los 118
    // proyectos y tenían contenido en UNO cada una. Ahora las enciende el CSE.
    expect(piecesCreatedWithProject().map((p) => p.slug).sort()).toEqual([
      "exploration",
      "kickoff",
      "timeline",
    ]);
  });

  it("handoff y requerimientos técnicos NO se pre-crean", () => {
    expect(pieceBySlug("handoff")!.createdWithProject).toBe(false);
    expect(pieceBySlug("tech-requirements")!.createdWithProject).toBe(false);
  });

  it("toda pieza que nace con el proyecto tiene su definición de canvas", async () => {
    // `createDefaultCanvases` cruza registro × canvas-defs por slug y descarta lo que no
    // encuentra. Sin este test, marcar una pieza como "nace con el proyecto" sin darle
    // definición la haría desaparecer en silencio: el proyecto nacería sin ella y nada
    // fallaría.
    const { DEFAULT_PROJECT_CANVASES } = await import("@/lib/canvas/canvas-defs");
    const definidas = new Set(DEFAULT_PROJECT_CANVASES.map((c) => c.slug));
    for (const p of piecesCreatedWithProject()) {
      expect(definidas.has(p.slug), `la pieza "${p.slug}" nace con el proyecto pero no tiene definición de canvas`)
        .toBe(true);
    }
  });

  it("los tags técnicos encienden la pieza de requerimientos", () => {
    expect(piecesEnabledByTags(["custom_dev"]).map((p) => p.slug)).toEqual(["tech-requirements"]);
    expect(piecesEnabledByTags(["insider_one"]).map((p) => p.slug)).toEqual(["tech-requirements"]);
    expect(piecesEnabledByTags(["sales_hub", "marketing_hub"])).toEqual([]);
  });

  it("el agente resuelve su pieza por grupo", () => {
    expect(pieceByAgentGroup("desarrollo")?.slug).toBe("tech-requirements");
    expect(pieceByAgentGroup("exploracion")?.slug).toBe("exploration");
    expect(pieceByAgentGroup("no-existe")).toBeNull();
  });
});


/**
 * ── `ownRenderer` ES LA FUENTE, NO UN ADORNO ─────────────────────────────────
 * El panel del proyecto DERIVA de este campo qué canvases excluir de la grilla genérica
 * `SectionBlockList`. Declararlo mal tiene dos modos de falla, los dos visibles y ninguno
 * ruidoso:
 *   · `false` con renderer propio ⇒ el canvas se pinta DOS VECES (el suyo arriba y la grilla
 *     vieja debajo, con «Sin contenido — ejecuta agentes» repetido por sección).
 *   · `true` sin renderer propio ⇒ el canvas queda EN BLANCO.
 *
 * Pasó dos veces. Primero con Exploración; después con Entrega, el día que nació. Y al ir a
 * arreglarlo apareció el problema de fondo: había TRES listas de lo mismo —este campo, un
 * `Set` transcrito en el panel y los `activeSlug === "…"` del propio panel— y ya no
 * coincidían. El campo estaba mal en cuatro piezas justamente porque nadie lo leía.
 *
 * Esta guarda las cruza en LOS DOS SENTIDOS. Es lo que convierte «acordate de mirar el set»
 * (un comentario, que no obliga a nada) en «no compila verde».
 */
describe("ownRenderer ↔ el panel del proyecto", () => {
  const PANEL = "components/clients/ProjectCanvasPanel.tsx";
  const src = fs.readFileSync(path.join(process.cwd(), PANEL), "utf8");

  /** Los slugs que el panel trata de forma especial: `activeSlug === "x"`. */
  const enElPanel = new Set([...src.matchAll(/activeSlug === "([a-z][a-z0-9-]*)"/g)].map((m) => m[1]));

  const declarados = new Set(PIECES.filter((p) => p.scope === "project" && p.ownRenderer).map((p) => p.slug));

  it("la guarda mira algo (si el panel cambia de forma, esto avisa)", () => {
    expect(enElPanel.size, `no encontré ningún \`activeSlug === "…"\` en ${PANEL}`).toBeGreaterThan(5);
  });

  it("todo canvas con renderer propio en el panel lo DECLARA en el registro", () => {
    const sinDeclarar = [...enElPanel].filter((s) => !declarados.has(s));
    expect(
      sinDeclarar,
      "Estos canvases tienen su propio render en el panel pero el registro dice " +
        "`ownRenderer: false`, así que la grilla genérica se pinta DEBAJO del suyo — el canvas " +
        "sale duplicado, con «Sin contenido — ejecuta agentes» repetido por sección:\n" +
        sinDeclarar.join("\n"),
    ).toEqual([]);
  });

  it("y todo el que lo declara TIENE su render en el panel", () => {
    const sinRender = [...declarados].filter((s) => !enElPanel.has(s));
    expect(
      sinRender,
      "Estos declaran `ownRenderer: true` pero el panel no los rutea a ningún componente: " +
        "quedan EN BLANCO, porque además se los excluye de la grilla genérica:\n" + sinRender.join("\n"),
    ).toEqual([]);
  });

  it("el panel DERIVA el set en vez de transcribirlo", () => {
    /* Sin esto la guarda se puede satisfacer manteniendo las dos listas a mano y sincronizadas
       — que es exactamente el estado del que veníamos, y que se desincronizó dos veces. */
    expect(
      src,
      "el panel volvió a escribir a mano la lista de canvases con renderer propio",
    ).toMatch(/CANVAS_CON_RENDERER_PROPIO = new Set\(\s*PIECES\.filter/);
  });
});
