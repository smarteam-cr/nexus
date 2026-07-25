/**
 * lib/pieces/registry.test.ts — el registro de piezas.
 *
 * Lo que estos tests FIJAN: la identidad de una pieza (`slug`) y su nombre visible
 * (`label`) son cosas distintas. Renombrar una pieza tiene que ser cambiar un label
 * y nada más — si un test de acá se pone rojo al renombrar, es que el rename se
 * filtró a la identidad y va a romper datos, ruteo o permisos en producción.
 */
import { describe, it, expect } from "vitest";
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
  it("las piezas que se pre-crean con el proyecto son las del seed actual", () => {
    expect(piecesCreatedWithProject().map((p) => p.slug).sort()).toEqual([
      "diagnosis",
      "exploration",
      "kickoff",
      "planning",
      "timeline",
    ]);
  });

  it("handoff y requerimientos técnicos NO se pre-crean", () => {
    expect(pieceBySlug("handoff")!.createdWithProject).toBe(false);
    expect(pieceBySlug("tech-requirements")!.createdWithProject).toBe(false);
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
