import { describe, expect, it } from "vitest";
import { ETAPAS_DEL_CICLO, etapaPorNombre, etapaSiguiente, etapaDelProyecto, leerMueve, nombreDelCiclo, PIEZAS_DE_UN_SERVICIO_RECURRENTE } from "./ciclo";
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
  it("el Ciclo primero, y ninguna pieza de una implementación (kickoff, diagnóstico, entrega)", () => {
    expect(PIEZAS_DE_UN_SERVICIO_RECURRENTE[0]).toBe("cycle");
    for (const s of PIEZAS_DE_UN_SERVICIO_RECURRENTE) expect(pieceBySlug(s), s).not.toBeNull();
    const filas = buildPieceRows(
      [
        { id: "k", slug: "kickoff", name: "Kickoff" },
        { id: "t", slug: "timeline", name: "Cronograma" },
      ],
      { piezasDelServicio: PIEZAS_DE_UN_SERVICIO_RECURRENTE, sinCanvas: { cycle: "vacia" } },
    ).map((r) => r.slug);
    expect(filas).toEqual(["cycle", "timeline", "exploration"]);
    expect(filas).not.toContain("kickoff");
  });

  it("sin el servicio, el Ciclo no aparece en el flujo de una implementación", () => {
    const filas = buildPieceRows([{ id: "t", slug: "timeline", name: "Cronograma" }]).map((r) => r.slug);
    expect(filas).not.toContain("cycle");
  });

  it("SmartLoop no se da de alta desde el formulario ni lleva kickoff", () => {
    const sl = PROJECT_PIPELINES.find((p) => p.key === "smartloop")!;
    expect(sl.servicioRecurrente).toBe("smartloop");
    expect(sl.seedPieces).not.toContain("kickoff");
    expect(sl.closedStageIds).toEqual(sl.stages.filter((s) => s.terminal).map((s) => s.id));
  });
});
