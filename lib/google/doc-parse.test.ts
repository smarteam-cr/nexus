import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseDocTabs,
  parseDocBody,
  tienePatronDeHablantes,
  esPlantillaVacia,
  MIN_TRANSCRIPT_CHARS,
  type DocTab,
} from "./doc-parse";

/**
 * lib/google/doc-parse.test.ts — LA POLÍTICA DE LECTURA DE UN DOC DE GEMINI, COMO TABLA.
 *
 * ── EL BUG QUE ESTE ARCHIVO CONGELA (2026-08-08) ────────────────────────────
 * La lógica vieja: `if (transcriptTab || notesTab) { transcript = transcriptTab ? … : null }`.
 * Con SOLO la pestaña de notas matcheada, devolvía transcript=null y nunca caía al fallback:
 * un transcript renombrado por Google se perdía por completo, sin error y sin log persistente.
 * Medido: ~464 sesiones con notas larguísimas y transcript vacío. Las fixtures de acá abajo
 * se escribieron para FALLAR contra esa lógica — son la prueba de que el arreglo arregla.
 */

/** Un tab de mentira con título y texto. */
function tab(titulo: string, texto: string): DocTab {
  return {
    tabProperties: { title: titulo },
    documentTab: {
      body: { content: [{ paragraph: { elements: [{ textRun: { content: texto } }] } }] },
    },
  };
}

/** Un diálogo sintético con patrón de hablantes, del largo pedido. */
function dialogo(chars: number): string {
  const linea = "Andrés Salas: bueno, entonces conectamos el webhook de Aircall al pipeline.\n" +
    "Cliente Wherex: perfecto, y eso dispara la creación del ticket, ¿no?\n";
  return linea.repeat(Math.ceil(chars / linea.length)).slice(0, chars);
}

const NOTAS_LARGAS =
  "Resumen de la reunión generado por Gemini.\n" +
  "Se discutió la integración de Aircall con HubSpot, la responsabilidad del webhook, " +
  "los plazos del pase a producción y los accesos pendientes del cliente. ".repeat(30);

describe("parseDocTabs — la tabla", () => {
  it("pestaña de transcripción reconocida → el caso feliz de siempre", () => {
    const r = parseDocTabs([tab("Transcripción", dialogo(5000)), tab("Notas de Gemini", NOTAS_LARGAS)]);
    expect(r.transcript).toContain("Andrés Salas:");
    expect(r.summary?.overview).toContain("Gemini");
    expect(r.diagnostico.motivo).toBe("pestana_reconocida");
    expect(r.diagnostico.tabsVistos).toEqual(["Transcripción", "Notas de Gemini"]);
  });

  it('"Transcript" en inglés sigue matcheando', () => {
    const r = parseDocTabs([tab("Meeting transcript", dialogo(3000))]);
    expect(r.transcript).not.toBeNull();
    expect(r.diagnostico.motivo).toBe("pestana_reconocida");
  });

  /**
   * ── LA FIXTURE DEL BUG ──────────────────────────────────────────────────────
   * ROTA A PROPÓSITO contra la lógica vieja: con «Notas de Gemini» + una pestaña renombrada
   * («Grabación de la reunión») que contiene 5k chars de diálogo, la lógica vieja devolvía
   * transcript=null — el diálogo entero se perdía. La nueva lo PROMUEVE por contenido.
   */
  it("LA fixture: pestaña renombrada con diálogo NO se pierde — se promueve", () => {
    const r = parseDocTabs([
      tab("Notas de Gemini", NOTAS_LARGAS),
      tab("Grabación de la reunión", dialogo(5000)),
    ]);
    expect(r.transcript, "el transcript renombrado se perdió — volvió la trampa").not.toBeNull();
    expect(r.transcript).toContain("Andrés Salas:");
    expect(r.summary, "las notas también tienen que sobrevivir").not.toBeNull();
    expect(r.diagnostico.motivo).toBe("promovido_por_contenido");
  });

  it("unas notas cortas solas NO se promueven a transcript", () => {
    /* La promoción exige diálogo de verdad: sin esto, cualquier acta chica terminaría como
       "transcript" y el post-proceso generaría minutas sobre ruido. */
    const r = parseDocTabs([tab("Notas de Gemini", NOTAS_LARGAS), tab("Apuntes", "Tres líneas sueltas sin formato de diálogo que no llegan al piso.")]);
    expect(r.transcript).toBeNull();
    expect(r.diagnostico.motivo).toBe("solo_notas");
  });

  it("un tab grande SIN patrón de hablantes tampoco se promueve", () => {
    const prosa = "Acta extensa de acuerdos y contexto del proyecto sin ninguna forma de diálogo. ".repeat(60);
    const r = parseDocTabs([tab("Notas de Gemini", NOTAS_LARGAS), tab("Acta", prosa)]);
    expect(r.transcript).toBeNull();
    expect(r.diagnostico.motivo).toBe("solo_notas");
  });

  it("ningún tab reconocido → se une todo (comportamiento histórico conservado)", () => {
    const r = parseDocTabs([tab("Parte 1", dialogo(800)), tab("Parte 2", dialogo(800))]);
    expect(r.transcript).not.toBeNull();
    expect(r.diagnostico.motivo).toBe("union_de_tabs");
  });

  /**
   * ROTA A PROPÓSITO contra la lógica vieja: una plantilla de 120 chars contaba como
   * transcript exitoso (66 filas así en producción) y hasta disparaba el post-proceso.
   */
  it("LA fixture: la plantilla vacía NO cuenta como transcript", () => {
    const r = parseDocTabs([tab("Notas", "Resumen\nDetalles\nAcciones\n(pendiente)")]);
    expect(r.transcript, "la plantilla volvió a contar como éxito").toBeNull();
    expect(["plantilla_vacia", "solo_notas"]).toContain(r.diagnostico.motivo);
  });

  it("la pestaña de transcripción reconocida pero VACÍA se reporta como plantilla", () => {
    const r = parseDocTabs([tab("Transcripción", "…"), tab("Notas de Gemini", NOTAS_LARGAS)]);
    expect(r.transcript).toBeNull();
    expect(r.diagnostico.motivo).toBe("plantilla_vacia");
    // Y las notas sobreviven: el diagnóstico es del transcript, no del doc entero.
    expect(r.summary).not.toBeNull();
  });

  it("sin tabs con texto → vacio", () => {
    expect(parseDocTabs([tab("A", ""), tab("B", "  ")]).diagnostico.motivo).toBe("vacio");
  });
});

describe("parseDocBody — el doc sin tabs", () => {
  it("body con contenido real → transcript", () => {
    const r = parseDocBody(dialogo(2000));
    expect(r.transcript).not.toBeNull();
    expect(r.diagnostico.motivo).toBe("body_sin_tabs");
  });
  it("body plantilla → null", () => {
    expect(parseDocBody("Resumen\nDetalles").diagnostico.motivo).toBe("plantilla_vacia");
  });
  it("body vacío → vacio", () => {
    expect(parseDocBody("   ").diagnostico.motivo).toBe("vacio");
  });
});

describe("los detectores", () => {
  it("tienePatronDeHablantes: diálogo sí, prosa no", () => {
    expect(tienePatronDeHablantes(dialogo(1200))).toBe(true);
    expect(tienePatronDeHablantes("Un acta en prosa continua sin dos puntos por hablante. ".repeat(40))).toBe(false);
  });
  it("tienePatronDeHablantes: marcas de tiempo de un VTT también valen", () => {
    expect(tienePatronDeHablantes("00:01 hola\n00:15 seguimos\n01:03 cerramos el tema del webhook")).toBe(true);
  });
  it(`esPlantillaVacia: el umbral es ${MIN_TRANSCRIPT_CHARS} chars, el mismo del post-proceso`, () => {
    expect(esPlantillaVacia("x".repeat(MIN_TRANSCRIPT_CHARS - 1))).toBe(true);
    expect(esPlantillaVacia("x".repeat(MIN_TRANSCRIPT_CHARS))).toBe(false);
  });
});

describe("candado: el parser tiene un solo dueño", () => {
  /**
   * `findTabByKeyword` y la decisión de qué es transcript NO pueden volver a vivir en
   * `meet-enrichment.ts`: la trampa nació justamente de tener la política inline entre el
   * fetch y la escritura. La edición que pone esto en rojo: copiar el matcheo de keywords
   * de vuelta a meet-enrichment "para no importar".
   */
  it("meet-enrichment delega en parseDocTabs y no re-implementa el matcheo", () => {
    const src = fs
      .readFileSync(path.join(process.cwd(), "lib/google/meet-enrichment.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");
    expect(src, "meet-enrichment dejó de delegar en el parser").toContain("parseDocTabs(");
    expect(src, "volvió el matcheo de keywords inline — la trampa renace").not.toContain(
      "findTabByKeyword",
    );
    expect(src, "volvió la unión de tabs inline").not.toMatch(/tabs\s*\.map\(extractTabText\)/);
  });
});
