import { describe, expect, it } from "vitest";
import { pieceReadiness, piezaAplica } from "./piece-readiness";
import { pipelineByKey } from "@/lib/projects/kind";
import { canvasDefForSlug } from "@/lib/canvas/canvas-defs";
import { piecesInFlowOrder } from "./stage-pieces";
import { pieceBySlug } from "@/lib/pieces/registry";

/* `hubspotPipelineId: null` = pipeline desconocido, que es la fila LEGACY. Todos los casos
   de abajo que no lo pisan están probando el comportamiento de siempre. */
const sinNada = {
  tags: [] as string[],
  piezasConContenido: [] as string[],
  hubspotPipelineId: null as string | null,
};

describe("una pieza que los tags NO justifican", () => {
  it("avisa con el rótulo que ve el usuario, no con el slug", () => {
    const r = pieceReadiness("tech-requirements", sinNada);
    expect(r.applies).toBe(false);
    expect(r.reason).toContain("Integración / Desarrollo a medida");
    expect(r.reason).not.toContain("custom_dev");
  });

  it("dice qué hacer, no solo qué falta", () => {
    // Todos los avisos del sistema terminan con la salida. Un aviso que solo diagnostica
    // deja al CSE adivinando dónde se arregla.
    expect(pieceReadiness("tech-requirements", sinNada).reason).toContain("handoff");
  });

  it("alcanza con UNO de los tags", () => {
    expect(pieceReadiness("tech-requirements", { ...sinNada, tags: ["insider_one"] }).applies).toBe(
      true,
    );
    expect(piezaAplica("tech-requirements", { tags: ["custom_dev"], hubspotPipelineId: null })).toBe(true);
    expect(piezaAplica("tech-requirements", { tags: ["sales_hub"], hubspotPipelineId: null })).toBe(false);
  });

  it("NUNCA bloquea: el aviso no impide nada", () => {
    // La regla del sistema entero: propone, no manda. Un tag mal puesto no puede dejar al
    // CSE peleando con la herramienta.
    const r = pieceReadiness("tech-requirements", sinNada);
    expect(r.reason).toContain("Podés agregarla igual");
  });
});

describe("el pipeline es un camino INDEPENDIENTE del tag", () => {
  /* Las cuatro esquinas. La pieza `tech-requirements` le corresponde a un proyecto por el
     tag O por venir del pipeline de Desarrollo — nunca hace falta que se den las dos. */
  const DEV = pipelineByKey("development").hubspotPipelineId;
  const CS = pipelineByKey("customer-success").hubspotPipelineId;

  it("Desarrollo SIN tags: le corresponde igual", () => {
    /* Es el caso que motivó el cambio: un desarrollo veía "Sin tag Desarrollo a medida"
       sobre su pieza central, porque nada deriva el tag desde el pipeline. */
    const r = pieceReadiness("tech-requirements", { ...sinNada, hubspotPipelineId: DEV });
    expect(r.applies).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("Customer Success SIN tags: NO le corresponde — el camino legacy, intacto", () => {
    const r = pieceReadiness("tech-requirements", { ...sinNada, hubspotPipelineId: CS });
    expect(r.applies).toBe(false);
    expect(r.reason).toContain("Integración / Desarrollo a medida");
  });

  it("Customer Success CON el tag: le corresponde — el camino de siempre", () => {
    const r = pieceReadiness("tech-requirements", {
      ...sinNada,
      tags: ["custom_dev"],
      hubspotPipelineId: CS,
    });
    expect(r.applies).toBe(true);
  });

  it("sin pipeline y sin tags: NO le corresponde (fila legacy, byte por byte)", () => {
    expect(pieceReadiness("tech-requirements", sinNada).applies).toBe(false);
  });

  it("el motivo nombra los DOS caminos, no solo el tag", () => {
    /* Si solo dijera "te falta el tag", alguien buscando por qué no aparece la pieza en un
       proyecto de CS se llevaría media respuesta. */
    const r = pieceReadiness("tech-requirements", { ...sinNada, hubspotPipelineId: CS });
    expect(r.reason).toContain("Desarrollo e integración");
  });

  it("todo `anyPipeline` declarado es una clave válida del registro de pipelines", () => {
    // Un typo acá desactiva la puerta en silencio: nunca matchea y nadie se entera.
    for (const slug of ["tech-requirements"]) {
      const r = pieceReadiness(slug, { ...sinNada, hubspotPipelineId: DEV });
      expect(r.applies, `"${slug}" declara un pipeline que no resuelve`).toBe(true);
    }
  });
});

describe("una pieza a la que le faltan pasos previos", () => {
  it("el Diagnóstico se apoya en la Exploración", () => {
    const r = pieceReadiness("diagnosis", sinNada);
    expect(r.applies).toBe(true); // le corresponde al proyecto…
    expect(r.ready).toBe(false); // …pero todavía no tiene de dónde agarrarse
    expect(r.reason).toContain("Exploración");
    expect(r.reason).toContain("se apoya en lo que se averiguó");
  });

  it("con el paso previo hecho, deja de avisar", () => {
    const r = pieceReadiness("diagnosis", { ...sinNada, piezasConContenido: ["exploration"] });
    expect(r).toEqual({ applies: true, ready: true, reason: null, shortReason: null });
  });

  it("la Implementación necesita entender al cliente primero", () => {
    // Lo que pidió el negocio: ocurre cuando ya se entendió al cliente y su situación.
    const r = pieceReadiness("implementation", sinNada);
    expect(r.ready).toBe(false);
    expect(r.reason).toContain("Exploración y Planificación");
    expect(r.reason).toContain("entender al cliente");
  });

  it("nombra SOLO lo que falta, no la lista entera", () => {
    const r = pieceReadiness("implementation", {
      ...sinNada,
      piezasConContenido: ["exploration"],
    });
    expect(r.reason).toContain("Planificación");
    expect(r.reason).not.toContain("Exploración");
  });
});

describe("las piezas sin condiciones", () => {
  it("Kickoff, Cronograma y Exploración aplican siempre", () => {
    for (const slug of ["kickoff", "timeline", "exploration"]) {
      expect(pieceReadiness(slug, sinNada), `${slug} no debería tener condiciones`).toEqual({
        applies: true,
        ready: true,
        reason: null,
        shortReason: null,
      });
    }
  });
});

describe("candado: toda pieza del desplegable se puede activar", () => {
  it("cada pieza del flujo tiene su estructura declarada", () => {
    // El `+` del desplegable promete crear la pieza. Sin definición de secciones esa
    // promesa explota en runtime — que es exactamente lo que le pasaba a Implementación
    // antes de declararla. El handoff queda afuera: no se activa desde el desplegable.
    for (const slug of piecesInFlowOrder("full")) {
      if (slug === "handoff") continue;
      const def = canvasDefForSlug(slug);
      expect(
        def,
        `la pieza "${pieceBySlug(slug)?.label ?? slug}" está en el desplegable pero no tiene ` +
          `definición de secciones: activarla fallaría.`,
      ).not.toBeNull();
      // El Cronograma es la excepción declarada: su contenido no vive en bloques de
      // canvas sino en el modelo del cronograma, así que su canvas no tiene secciones
      // a propósito (es solo el contenedor que el Gantt usa de ancla).
      if (slug === "timeline") continue;
      expect(def!.sections.length, `"${slug}" no declara ninguna sección`).toBeGreaterThan(0);
    }
  });

  it("cada definición declara el slug de su pieza", () => {
    for (const slug of piecesInFlowOrder("full")) {
      if (slug === "handoff") continue;
      expect(canvasDefForSlug(slug)!.slug).toBe(slug);
    }
  });
});
