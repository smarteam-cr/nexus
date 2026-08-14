/**
 * lib/flow/stage-pieces.test.ts — el mapa etapa↔pieza no puede desincronizarse.
 *
 * Tres fuentes tienen que contar la misma historia: el enum de etapas de Prisma, el
 * motor que decide en qué etapa está un proyecto, y el catálogo de piezas. Este test es
 * lo que impide que se separen — y las tres se tocan desde lados distintos del repo.
 */
import { describe, expect, it } from "vitest";
import {
  STAGE_FLOW,
  flowForStage,
  isMilestone,
  stageForPiece,
  stagesForCycle,
  piecesInFlowOrder,
} from "./stage-pieces";
import { FULL_CYCLE_ORDER, SHORT_CYCLE_ORDER, STAGE_EXIT_STEPS } from "@/lib/lifecycle/stage-engine";
import { PIECES } from "@/lib/pieces/registry";

describe("cobertura: el mapa cubre el ciclo entero", () => {
  it("cada etapa del ciclo full aparece exactamente una vez", () => {
    for (const stage of FULL_CYCLE_ORDER) {
      const filas = STAGE_FLOW.filter((f) => f.stage === stage);
      expect(filas.length, `la etapa ${stage} aparece ${filas.length} veces en STAGE_FLOW`).toBe(1);
      expect(filas[0].cycles).toContain("full");
    }
  });

  it("cada etapa del ciclo corto también, y declara el ciclo corto", () => {
    for (const stage of SHORT_CYCLE_ORDER) {
      const fila = flowForStage(stage);
      expect(fila, `la etapa ${stage} del ciclo corto no está en STAGE_FLOW`).not.toBeNull();
      expect(fila!.cycles).toContain("short");
    }
  });

  it("no hay etapas de más: toda fila pertenece a algún ciclo real", () => {
    const conocidas = new Set([...FULL_CYCLE_ORDER, ...SHORT_CYCLE_ORDER]);
    for (const f of STAGE_FLOW) {
      expect(conocidas.has(f.stage), `STAGE_FLOW tiene "${f.stage}", que no está en ningún ciclo`)
        .toBe(true);
    }
  });

  it("el orden de las etapas del mapa respeta el orden del motor", () => {
    expect(stagesForCycle("full").map((f) => f.stage)).toEqual(FULL_CYCLE_ORDER);
    expect(stagesForCycle("short").map((f) => f.stage)).toEqual(SHORT_CYCLE_ORDER);
  });
});

describe("los gates no pueden divergir del motor", () => {
  it("cada etapa con gate declara EL MISMO que usa inferLifecycleStage", () => {
    // Si alguien cambia el gate de una etapa en el motor y no acá, la barra de flujo
    // mostraría la etapa cerrándose con un gate que ya no la cierra.
    for (const step of STAGE_EXIT_STEPS) {
      const fila = flowForStage(step.stage);
      expect(fila, `el motor cierra ${step.stage} pero el mapa no la tiene`).not.toBeNull();
      expect(
        fila!.gate,
        `${step.stage}: el motor usa "${step.gate}" y el mapa dice "${fila!.gate}"`,
      ).toBe(step.gate);
    }
  });
});

describe("las piezas del flujo", () => {
  const deProyecto = PIECES.filter((p) => p.scope === "project").map((p) => p.slug);

  it("toda pieza de PROYECTO está en exactamente una etapa", () => {
    for (const slug of deProyecto) {
      const etapas = STAGE_FLOW.filter((f) => f.pieces.includes(slug)).map((f) => f.stage);
      expect(etapas.length, `la pieza "${slug}" está en ${etapas.length} etapas: ${etapas}`).toBe(1);
    }
  });

  it("ninguna pieza de otro ámbito entra al flujo del proyecto", () => {
    // La propuesta comercial cuelga de un BusinessCase y la Información del cliente es
    // del CLIENTE (dos proyectos la comparten): meterlas en la barra de un proyecto
    // sería mentir sobre a quién pertenecen.
    const ajenas = PIECES.filter((p) => p.scope !== "project").map((p) => p.slug);
    for (const slug of ajenas) {
      expect(stageForPiece(slug), `"${slug}" (ámbito ajeno) aparece en el flujo`).toBeNull();
    }
  });

  it("toda pieza nombrada en el mapa existe en el registro", () => {
    const conocidas = new Set(PIECES.map((p) => p.slug));
    for (const f of STAGE_FLOW) {
      for (const slug of f.pieces) {
        expect(conocidas.has(slug), `la etapa ${f.stage} nombra "${slug}", que no está registrada`)
          .toBe(true);
      }
    }
  });

  it("la pieza primaria siempre es una de las de su etapa", () => {
    for (const f of STAGE_FLOW) {
      if (!f.primary) continue;
      expect(f.pieces, `${f.stage}: la primaria "${f.primary}" no está entre sus piezas`).toContain(
        f.primary,
      );
    }
  });

  it("una etapa con piezas tiene primaria, salvo la que se cierra fuera de Nexus", () => {
    // CONFIGURACION_TECNICA es la excepción declarada: tiene documento pero su gate
    // (demo aprobada) lo cierra el cliente en HubSpot.
    const sinPrimaria = STAGE_FLOW.filter((f) => f.pieces.length > 0 && f.primary === null);
    expect(sinPrimaria.map((f) => f.stage)).toEqual(["CONFIGURACION_TECNICA"]);
  });
});

describe("los hitos", () => {
  it("las etapas finales son hitos: se marcan, no se abren", () => {
    for (const stage of ["ADOPCION", "VALIDACION_USO", "FINALIZADO"] as const) {
      expect(isMilestone(stage), `${stage} dejó de ser hito`).toBe(true);
    }
    /* ⚠ ENTREGA salió de esta lista el 2026-08-12 y NO por descuido: estrenó la pieza
       `delivery`, el documento de cierre que se le comparte al cliente. Volver a meterla acá
       sin sacar la pieza deja el mapa mintiendo. El porqué está en el header del módulo. */
    expect(isMilestone("ENTREGA"), "ENTREGA tiene documento desde 2026-08-12").toBe(false);
    expect(isMilestone("OPERACION_CONTINUA")).toBe(true);
  });

  it("las etapas con trabajo NO son hitos", () => {
    for (const stage of ["HAND_OFF", "EXPLORACION", "DIAGNOSTICO", "PLANIFICACION"] as const) {
      expect(isMilestone(stage)).toBe(false);
    }
  });
});

describe("el orden narrativo de la médula", () => {
  it("es el que describió el negocio, de punta a punta", () => {
    expect(piecesInFlowOrder("full")).toEqual([
      "handoff",
      "kickoff",
      "exploration",
      "diagnosis",
      "timeline",
      "planning",
      "tech-requirements",
      "implementation",
      "delivery",
    ]);
  });

  it("el ciclo corto solo trabaja el arranque", () => {
    // La entrega también existe en el ciclo corto: un servicio recurrente también se cierra.
    expect(piecesInFlowOrder("short")).toEqual(["handoff", "kickoff", "delivery"]);
  });
});
