/**
 * lib/flow/canvas-chips.test.ts — los chips de canvas del widget.
 *
 * ── LO QUE ATACA ─────────────────────────────────────────────────────────────
 * 1. Que el widget vuelva a mostrar CUATRO señales fijas. Antes eran handoff, kickoff,
 *    cronograma y procesos: un proyecto con Diagnóstico y Planificación generados se veía
 *    igual que uno sin ellos, y las piezas que faltaban ni siquiera existían para el CSE.
 * 2. Que reaparezca un chip permanente de algo que el proyecto NUNCA va a tener. Es el
 *    "Sin kickoff" en rojo de un desarrollo — ya lo sacamos una vez con una excepción
 *    escrita a mano solo para el kickoff; ahora la regla es general y sale de `piezaAplica`.
 * 3. Que el Cronograma pierda su tercer estado. "Existe pero sin subir al cliente" es
 *    información que el CSE usa; aplastarla a "generada" esconde el paso que falta.
 */
import { describe, expect, it } from "vitest";
import { buildCanvasChips } from "./canvas-chips";
import { pipelineByKey } from "@/lib/projects/kind";

const CS = pipelineByKey("customer-success").hubspotPipelineId;
const DEV = pipelineByKey("development").hubspotPipelineId;

const base = {
  canvases: [] as Array<{ id: string; slug: string | null; name: string; hasContent?: boolean }>,
  tags: [] as string[],
  hubspotPipelineId: CS as string | null,
  cronograma: "sin" as "sin" | "borrador" | "publicado",
  tieneProcesos: false,
  handoffDelHermano: null as { generado: boolean } | null,
};

const slugs = (o: Partial<typeof base> = {}) =>
  buildCanvasChips({ ...base, ...o }).map((c) => c.slug);
const estadoDe = (slug: string, o: Partial<typeof base> = {}) =>
  buildCanvasChips({ ...base, ...o }).find((c) => c.slug === slug)?.estado;

describe("qué chips se listan", () => {
  it("una implementación muestra su recorrido completo, no cuatro señales", () => {
    /* Transcrito: si mañana se agrega una pieza al recorrido, este test obliga a decidir
       si entra al widget en vez de que aparezca sola o quede afuera sin que nadie lo note. */
    expect(slugs()).toEqual([
      "handoff",
      "kickoff",
      "exploration",
      "diagnosis",
      "timeline",
      "planning",
      "implementation",
      // Decidido al agregarla (2026-08-12): la Entrega ENTRA al widget. El widget responde
      // "¿qué documentos tiene este proyecto?", y el de cierre es uno de ellos.
      "delivery",
      "procesos",
    ]);
  });

  it("el HANDOFF entra, aunque el desplegable del panel no lo liste", () => {
    /* Son dos preguntas distintas: el desplegable es "¿qué puedo abrir o activar?" (y el
       handoff tiene su propia sección arriba), el widget es "¿qué documentos tiene este
       proyecto?" — y el handoff es el primero de todos. */
    expect(slugs()).toContain("handoff");
  });

  it("un desarrollo NO muestra kickoff, y no queda un hueco rojo", () => {
    const s = slugs({ hubspotPipelineId: DEV });
    expect(s).not.toContain("kickoff");
    // …y sí muestra su pieza central, que en CS sin tags no aparece.
    expect(s).toContain("tech-requirements");
  });

  it("el requerimiento técnico aparece en una implementación CON el tag", () => {
    expect(slugs()).not.toContain("tech-requirements");
    expect(slugs({ tags: ["custom_dev"] })).toContain("tech-requirements");
  });

  it("un canvas suelto del CSE no entra: no tiene estado «pendiente»", () => {
    /* Nadie lo espera, así que no puede faltar. El desplegable sí lo lista — ahí nada
       desaparece. */
    const conSuelto = slugs({
      canvases: [{ id: "c1", slug: null, name: "Notas de la reunión", hasContent: true }],
    });
    expect(conSuelto).toEqual(slugs());
  });

  it("PROCESOS va último: es del CLIENTE, no del proyecto", () => {
    // Dos proyectos del mismo cliente comparten ese chip. Va al final para que se lea
    // como lo que es: contexto de la cuenta, no un paso más del recorrido.
    expect(slugs().at(-1)).toBe("procesos");
  });
});

describe("el handoff de un HERMANO no se mide con el canvas propio", () => {
  /* Un desarrollo que cuelga de una implementación comparte su handoff (B3). Su canvas
     propio está vacío por construcción: sin esta rama el chip diría "pendiente" sobre un
     documento completo que la sección de abajo está mostrando en solo lectura. */
  it("el del hermano generado → generada, aunque el canvas propio esté vacío", () => {
    expect(
      estadoDe("handoff", { hubspotPipelineId: DEV, handoffDelHermano: { generado: true } }),
    ).toBe("generada");
  });

  it("el del hermano sin generar → pendiente", () => {
    expect(
      estadoDe("handoff", { hubspotPipelineId: DEV, handoffDelHermano: { generado: false } }),
    ).toBe("pendiente");
  });

  it("sin hermano, se mide como cualquier otra pieza", () => {
    expect(
      estadoDe("handoff", {
        canvases: [{ id: "h", slug: "handoff", name: "Handoff", hasContent: true }],
      }),
    ).toBe("generada");
  });
});

describe("el estado de cada chip", () => {
  it("sin canvas → pendiente", () => {
    expect(estadoDe("diagnosis")).toBe("pendiente");
  });

  it("canvas existente pero VACÍO → pendiente, no generada", () => {
    /* Las piezas nacen con un bloque SEMILLA en sus secciones curadas. Contarlo pintaba de
       verde piezas vacías — el criterio único vive en lib/pieces/piece-content.ts y acá
       llega ya resuelto en `hasContent`. */
    expect(
      estadoDe("diagnosis", {
        canvases: [{ id: "c1", slug: "diagnosis", name: "Diagnóstico", hasContent: false }],
      }),
    ).toBe("pendiente");
  });

  it("canvas con contenido → generada", () => {
    expect(
      estadoDe("diagnosis", {
        canvases: [{ id: "c1", slug: "diagnosis", name: "Diagnóstico", hasContent: true }],
      }),
    ).toBe("generada");
  });

  it("el CRONOGRAMA conserva sus tres estados", () => {
    expect(estadoDe("timeline", { cronograma: "sin" })).toBe("pendiente");
    expect(estadoDe("timeline", { cronograma: "borrador" })).toBe("borrador");
    expect(estadoDe("timeline", { cronograma: "publicado" })).toBe("generada");
  });

  it("el cronograma NO se mide por bloques", () => {
    /* Su contenido vive en ProjectTimeline, no en CanvasBlock: con el criterio de bloques
       daba "vacío" en el 100% de los proyectos, incluso publicado. */
    expect(
      estadoDe("timeline", {
        canvases: [{ id: "c1", slug: "timeline", name: "Cronograma", hasContent: false }],
        cronograma: "publicado",
      }),
    ).toBe("generada");
  });

  it("procesos sale de la señal del cliente", () => {
    expect(estadoDe("procesos", { tieneProcesos: true })).toBe("generada");
    expect(estadoDe("procesos", { tieneProcesos: false })).toBe("pendiente");
  });
});
