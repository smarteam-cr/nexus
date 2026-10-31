import { describe, expect, it } from "vitest";
import { ETAPAS_DEL_CICLO, etapaPorNombre, etapaQueMuestraElCiclo, etapaQueMuestranLasPiezas, leerMueve } from "./ciclo";
import { SERVICIOS_RECURRENTES } from "./index";
import { PROJECT_PIPELINES } from "@/lib/projects/kind";
import { buildPieceRows } from "@/lib/flow/dropdown-rows";

describe("el ciclo", () => {
  it("las cinco etapas del método, en orden", () => {
    expect(ETAPAS_DEL_CICLO).toEqual(["diagnostico", "planificacion", "implementacion", "adopcion", "aprendizaje"]);
  });

  it("lee la etapa de HubSpot por nombre, sin tildes; Cancelado no es una etapa del ciclo", () => {
    expect(etapaPorNombre("Implementación")).toBe("implementacion");
    expect(etapaPorNombre("ADOPCIÓN")).toBe("adopcion");
    expect(etapaPorNombre("Cancelado")).toBeNull();
    expect(etapaPorNombre(null)).toBeNull();
  });

  it("un caso de uso puede mover varias dimensiones; lo que no trae dimensión se descarta", () => {
    expect(
      leerMueve([
        { area: "Ventas", dimension: "Datos", nivel: "Funcional" },
        { area: "Ventas", dimension: "Procesos", nivel: "Funcional" },
        { area: "Ventas", dimension: " " },
        "basura",
      ]),
    ).toHaveLength(2);
    expect(leerMueve(null)).toEqual([]);
  });
});

describe("la guía del CSE", () => {
  it("cada servicio tiene guía para las cinco etapas, con qué hacer, qué queda y la señal", () => {
    for (const g of Object.values(SERVICIOS_RECURRENTES)) {
      for (const e of ETAPAS_DEL_CICLO) {
        const etapa = g.etapas[e];
        expect(etapa.queHaces.length, `${g.clave}/${e}`).toBeGreaterThan(20);
        expect(etapa.producido.length, `${g.clave}/${e}`).toBeGreaterThan(0);
        expect(etapa.senal.length, `${g.clave}/${e}`).toBeGreaterThan(10);
      }
    }
  });

  it("todo pipeline con servicio recurrente tiene su guía", () => {
    for (const p of PROJECT_PIPELINES.filter((x) => x.servicioRecurrente)) {
      expect(SERVICIOS_RECURRENTES[p.servicioRecurrente!], p.key).toBeDefined();
    }
  });
});

describe("las piezas de un servicio recurrente", () => {
  it("arranca como cualquier proyecto: sin filas propias del ciclo", () => {
    const filas = buildPieceRows([
      { id: "k", slug: "kickoff", name: "Kickoff" },
      { id: "t", slug: "timeline", name: "Cronograma" },
    ]).map((r) => r.slug);
    expect(filas).toContain("kickoff");
    expect(filas).toContain("timeline");
    expect(filas.filter((x) => x.startsWith("cycle-"))).toEqual([]);
  });

  it("la etapa que muestran los documentos es solo una sugerencia hacia adelante", () => {
    expect(etapaQueMuestranLasPiezas([])).toBeNull();
    expect(etapaQueMuestranLasPiezas(["diagnosis"])).toBe("planificacion");
    expect(etapaQueMuestranLasPiezas(["diagnosis", "planning"])).toBe("implementacion");
  });

  it("sin el servicio, los artefactos del ciclo no aparecen en el flujo de una implementación", () => {
    const filas = buildPieceRows([{ id: "t", slug: "timeline", name: "Cronograma" }]).map((r) => r.slug);
    expect(filas.filter((x) => x.startsWith("cycle-"))).toEqual([]);
  });

  it("SmartLoop no se da de alta desde el formulario y lleva kickoff, como todo proyecto", () => {
    const sl = PROJECT_PIPELINES.find((p) => p.key === "smartloop")!;
    expect(sl.servicioRecurrente).toBe("smartloop");
    expect(sl.seedPieces).toContain("kickoff");
    expect(sl.closedStageIds).toEqual(sl.stages.filter((s) => s.terminal).map((s) => s.id));
  });
});

describe("la etapa que muestra el ciclo (prueba 30)", () => {
  it("sin ciclo abierto, en un proyecto de HubSpot manda la etapa de allá", () => {
    expect(etapaQueMuestraElCiclo({ enHubspot: true, rotuloDeHubspot: "Implementación", etapaGuardada: null })).toBe("implementacion");
  });
  it("sin ciclo abierto y sin HubSpot (la prueba), Diagnóstico", () => {
    expect(etapaQueMuestraElCiclo({ enHubspot: false, rotuloDeHubspot: "Implementación", etapaGuardada: null })).toBe("diagnostico");
  });
  it("con ciclo abierto, HubSpot manda; si HubSpot dice algo que no es del ciclo, la guardada", () => {
    expect(etapaQueMuestraElCiclo({ enHubspot: true, rotuloDeHubspot: "Adopción", etapaGuardada: "planificacion" })).toBe("adopcion");
    expect(etapaQueMuestraElCiclo({ enHubspot: true, rotuloDeHubspot: "Cancelado", etapaGuardada: "planificacion" })).toBe("planificacion");
    expect(etapaQueMuestraElCiclo({ enHubspot: false, rotuloDeHubspot: null, etapaGuardada: "otra" })).toBe("diagnostico");
  });
});
