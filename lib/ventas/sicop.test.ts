/**
 * lib/ventas/sicop.test.ts — el agrupado del tablero de licitaciones.
 *
 * Correr: `npx vitest run lib/ventas/sicop.test.ts --project unit`.
 *
 * Lo que se prueba NO es "agrupa por etapa" (eso es un `Map`), sino las tres decisiones que
 * se pueden romper sin que nada falle:
 *   1. el ORDEN lo manda HubSpot (`displayOrder`), no el orden en que vuelven los tickets;
 *   2. una etapa VACÍA se muestra igual — el tablero es el proceso completo;
 *   3. un ticket con una etapa desconocida NO se pierde. Perder una licitación en silencio
 *      es el modo de falla caro: la pantalla se ve bien y falta plata adentro.
 */
import { describe, expect, it } from "vitest";
import { agruparPorEtapa, ETAPA_HUERFANA, type EtapaDeclarada, type LicitacionSicop } from "./sicop";

const ETAPAS: EtapaDeclarada[] = [
  { id: "analisis", label: "Análisis de licitación", orden: 0, cerrada: false },
  { id: "aclaraciones", label: "Aclaraciones de Cartel", orden: 1, cerrada: false },
  { id: "perdido", label: "Perdido", orden: 9, cerrada: true },
];

function licitacion(id: string, etapaId: string, actualizadaEl: string | null = null): LicitacionSicop {
  return {
    id,
    asunto: `Licitación ${id}`,
    etapaId,
    detalle: null,
    procedimiento: null,
    presupuesto: null,
    tipoContratacion: null,
    formatoEvaluacion: null,
    fechaAclaraciones: null,
    motivoPerdida: null,
    responsable: null,
    prioridad: null,
    creadaEl: null,
    actualizadaEl,
  };
}

describe("agruparPorEtapa", () => {
  it("respeta el orden del PORTAL, no el orden en que llegan las etapas", () => {
    // HubSpot devuelve `stages` sin garantía de orden: el que vale es `displayOrder`.
    const desordenadas = [ETAPAS[2], ETAPAS[0], ETAPAS[1]];
    expect(agruparPorEtapa(desordenadas, []).map((e) => e.id)).toEqual([
      "analisis",
      "aclaraciones",
      "perdido",
    ]);
  });

  it("una etapa sin licitaciones SE MUESTRA (vacía), no desaparece", () => {
    /* Esconder las vacías haría que "no hay nada en Aclaraciones" se lea como "esa etapa
       no existe" — y el tablero dejaría de ser el proceso. */
    const tablero = agruparPorEtapa(ETAPAS, [licitacion("1", "analisis")]);
    expect(tablero).toHaveLength(3);
    expect(tablero.find((e) => e.id === "aclaraciones")!.licitaciones).toEqual([]);
  });

  it("⛔ un ticket con una etapa desconocida cae en un bucket final, NUNCA se descarta", () => {
    const tablero = agruparPorEtapa(ETAPAS, [
      licitacion("1", "analisis"),
      licitacion("2", "etapa-que-ya-no-existe"),
    ]);
    const huerfana = tablero[tablero.length - 1];
    expect(huerfana.id).toBe(ETAPA_HUERFANA);
    expect(huerfana.licitaciones.map((l) => l.id)).toEqual(["2"]);
    // …y el bucket solo aparece si hace falta.
    expect(agruparPorEtapa(ETAPAS, [licitacion("1", "analisis")]).map((e) => e.id)).not.toContain(
      ETAPA_HUERFANA,
    );
  });

  it("ninguna licitación se pierde ni se duplica", () => {
    const entrada = [
      licitacion("1", "analisis"),
      licitacion("2", "perdido"),
      licitacion("3", "fantasma"),
      licitacion("4", "perdido"),
    ];
    const ids = agruparPorEtapa(ETAPAS, entrada).flatMap((e) => e.licitaciones.map((l) => l.id));
    expect(ids.sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("dentro de una etapa, lo movido más recientemente va primero", () => {
    const tablero = agruparPorEtapa(ETAPAS, [
      licitacion("vieja", "analisis", "2026-01-10T00:00:00Z"),
      licitacion("nueva", "analisis", "2026-08-01T00:00:00Z"),
      licitacion("sin-fecha", "analisis", null),
    ]);
    expect(tablero[0].licitaciones.map((l) => l.id)).toEqual(["nueva", "vieja", "sin-fecha"]);
  });

  it("sin etapas declaradas devuelve el bucket huérfano, no una lista vacía", () => {
    /* El caso de "HubSpot contestó el pipeline sin stages": lo que NO puede pasar es que la
       pantalla muestre cero licitaciones teniendo tickets en la mano. */
    const tablero = agruparPorEtapa([], [licitacion("1", "analisis")]);
    expect(tablero.map((e) => e.id)).toEqual([ETAPA_HUERFANA]);
    expect(tablero[0].licitaciones).toHaveLength(1);
  });

  it("marca qué etapas CIERRAN — es lo que decide cuáles arrancan plegadas", () => {
    const tablero = agruparPorEtapa(ETAPAS, []);
    expect(tablero.filter((e) => e.cerrada).map((e) => e.id)).toEqual(["perdido"]);
  });
});
