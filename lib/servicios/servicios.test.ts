import { describe, expect, it } from "vitest";
import { ETAPAS_DEL_CICLO, etapaPorNombre, etapaQueMuestraElCiclo, etapaPosterior, etapaQueMuestranLasPiezas, etapaSiguiente, etapaDelProyecto, etapasDeLaPieza, leerMueve, nombreDelCiclo, PIEZA_DE_LA_ETAPA, PIEZAS_DE_UN_SERVICIO_RECURRENTE } from "./ciclo";
import { guiaDelCiclo } from "./guia";
import { SERVICIOS_RECURRENTES } from "./index";
import { GUIA_SMARTLOOP } from "./smartloop";
import { PROJECT_PIPELINES } from "@/lib/projects/kind";
import { pieceBySlug } from "@/lib/pieces/registry";
import { buildPieceRows } from "@/lib/flow/dropdown-rows";

describe("el ciclo", () => {
  it("las cinco etapas del método, en orden, y Aprendizaje no avanza (se cierra)", () => {
    expect(ETAPAS_DEL_CICLO).toEqual(["diagnostico", "planificacion", "implementacion", "adopcion", "aprendizaje"]);
    expect(etapaSiguiente("diagnostico")).toBe("planificacion");
    expect(etapaSiguiente("aprendizaje")).toBeNull();
  });

  it("lee la etapa de HubSpot por nombre, sin tildes; Cancelado no es una etapa del ciclo", () => {
    expect(etapaPorNombre("Implementación")).toBe("implementacion");
    expect(etapaPorNombre("ADOPCIÓN")).toBe("adopcion");
    expect(etapaPorNombre("Cancelado")).toBeNull();
    expect(etapaPorNombre(null)).toBeNull();
  });

  it("los nombres en pantalla", () => {
    expect(nombreDelCiclo({ numero: 1, nombre: "Corregir y adoptar" })).toBe("Ciclo 1 · Corregir y adoptar");
    expect(nombreDelCiclo({ numero: 2, nombre: "  " })).toBe("Ciclo 2");
    expect(etapaDelProyecto({ numero: 1, etapa: "implementacion" })).toBe("Ciclo 1 · Implementación");
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

  const base = { etapa: "planificacion" as const, meta: null, desde: null, hasta: null, casos: [] };

  it("marca lo que puede comprobar y deja sin marca lo que no (nunca como hecho)", () => {
    const g = guiaDelCiclo(GUIA_SMARTLOOP, base);
    const por = Object.fromEntries(g.producido.map((p) => [p.clave, p.hecho]));
    expect(por["casos-con-criterio"]).toBe(false);
    expect(por.meta).toBe(false);
    expect(por.fechas).toBe(false);
    expect(por["version-aprobada"]).toBeNull();
    expect(g.primeroQueFalta).toBe("Los casos de uso, cada uno con su criterio de aceptación");
    expect(g.senalVista).toBeNull(); // en Planificación todavía se está escribiendo
  });

  it("con todo escrito, no falta nada comprobable", () => {
    const g = guiaDelCiclo(GUIA_SMARTLOOP, {
      ...base,
      meta: "Que Ventas trabaje en HubSpot",
      desde: "2026-09-07",
      hasta: "2026-11-06",
      casos: [{ titulo: "Rutina de ventas", criterio: "Todo negocio tiene próxima actividad" }],
    });
    expect(g.primeroQueFalta).toBeNull();
  });

  it("después de planificar, un caso de uso sin criterio es la señal de que se saltó", () => {
    const g = guiaDelCiclo(GUIA_SMARTLOOP, {
      ...base,
      etapa: "implementacion",
      casos: [
        { titulo: "A", criterio: "x" },
        { titulo: "B", criterio: null },
      ],
    });
    expect(g.senalVista).toContain("Un caso de uso no tiene criterio");
    expect(guiaDelCiclo(GUIA_SMARTLOOP, { ...base, etapa: "adopcion" }).senalVista).toContain("sin casos de uso");
  });
});

describe("las piezas de un servicio recurrente", () => {
  it("el Cronograma junto al Resumen y, en el ciclo, los documentos de siempre más Adopción y Aprendizaje (2026-10-12)", () => {
    expect(PIEZAS_DE_UN_SERVICIO_RECURRENTE).toEqual([
      "timeline",
      "questionnaires",
      "exploration",
      "diagnosis",
      "planning",
      "tech-requirements",
      "cycle-adoption",
      "cycle-learning",
      "delivery",
    ]);
    for (const s of PIEZAS_DE_UN_SERVICIO_RECURRENTE) expect(pieceBySlug(s), s).not.toBeNull();
    const filas = buildPieceRows(
      [
        { id: "k", slug: "kickoff", name: "Kickoff" },
        { id: "t", slug: "timeline", name: "Cronograma" },
      ],
      {
        piezasDelServicio: PIEZAS_DE_UN_SERVICIO_RECURRENTE,
        sinCanvas: { "cycle-adoption": "vacia", "cycle-learning": "vacia" },
      },
    ).map((r) => r.slug);
    expect(filas).toEqual(["timeline", "exploration", "diagnosis", "planning", "tech-requirements", "cycle-adoption", "cycle-learning", "delivery"]);
    expect(filas).not.toContain("kickoff");
  });

  it("cada etapa tiene su artefacto: el Diagnóstico, la Planificación, el Cronograma, Adopción y Aprendizaje", () => {
    for (const e of ETAPAS_DEL_CICLO) expect(PIEZA_DE_LA_ETAPA[e], e).toBeTruthy();
    expect(etapasDeLaPieza("timeline")).toEqual(["implementacion"]);
    expect(etapasDeLaPieza("planning")).toEqual(["planificacion"]);
    expect(etapasDeLaPieza("cycle-adoption")).toEqual(["adopcion"]);
  });

  it("la etapa que muestran los documentos es solo una sugerencia hacia adelante", () => {
    expect(etapaQueMuestranLasPiezas([])).toBeNull();
    expect(etapaQueMuestranLasPiezas(["diagnosis"])).toBe("planificacion");
    expect(etapaQueMuestranLasPiezas(["diagnosis", "planning"])).toBe("implementacion");
    expect(etapaPosterior("implementacion", "diagnostico")).toBe(true);
    expect(etapaPosterior("diagnostico", "implementacion")).toBe(false);
  });

  it("sin el servicio, los artefactos del ciclo no aparecen en el flujo de una implementación", () => {
    const filas = buildPieceRows([{ id: "t", slug: "timeline", name: "Cronograma" }]).map((r) => r.slug);
    expect(filas.filter((x) => x.startsWith("cycle-"))).toEqual([]);
  });

  it("SmartLoop no se da de alta desde el formulario ni lleva kickoff", () => {
    const sl = PROJECT_PIPELINES.find((p) => p.key === "smartloop")!;
    expect(sl.servicioRecurrente).toBe("smartloop");
    expect(sl.seedPieces).not.toContain("kickoff");
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
