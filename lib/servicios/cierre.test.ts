import { describe, expect, it } from "vitest";
import { armarCierre, comprobacionesDelAprendizaje, estadoTrasLaDecision, faltaParaCerrar, leerCierre, type BorradorDelCierre } from "./cierre";
import { guiaDelCiclo } from "./guia";
import { GUIA_SMARTLOOP } from "./smartloop";

const completo: BorradorDelCierre = {
  meta: "El 80 % de los negocios con etapa al día",
  metaResultado: "parcial",
  metaEvaluada: "Llegó al 65 %.",
  siguienteCiclo: "Seguir con el pipeline y sumar el tablero.",
  casos: [
    { id: "a", titulo: "Pipeline", criterio: "80 % con etapa", criterioMedido: "65 %", decisionAlCerrar: "no_cumplido" },
    { id: "b", titulo: "Tablero", criterio: "Lo usa el gerente", criterioMedido: null, decisionAlCerrar: "pasa" },
    { id: "c", titulo: "Chat", criterio: null, criterioMedido: null, decisionAlCerrar: "descartado" },
  ],
};

describe("la regla de cierre", () => {
  it("con todo decidido, medido lo que se cierra, la meta evaluada y la propuesta, no falta nada", () => {
    expect(faltaParaCerrar(completo)).toEqual([]);
  });

  it("un caso sin decidir, uno que se cierra sin medir, la meta sin evaluar y sin propuesta: lo dice todo", () => {
    const falta = faltaParaCerrar({
      ...completo,
      metaResultado: null,
      siguienteCiclo: " ",
      casos: [
        { ...completo.casos[0], criterioMedido: "" },
        { ...completo.casos[1], decisionAlCerrar: null },
      ],
    });
    expect(falta).toEqual([
      "Mide el criterio de aceptación de «Pipeline».",
      "Decide qué pasa con «Tablero».",
      "Evalúa la meta del ciclo.",
      "Escribe la propuesta del siguiente ciclo.",
    ]);
  });

  it("sin casos de uso o sin meta no se cierra", () => {
    expect(faltaParaCerrar({ ...completo, casos: [] })[0]).toBe("El ciclo no tiene casos de uso: no hay nada que medir.");
    expect(faltaParaCerrar({ ...completo, meta: null })).toContain("El ciclo no tiene meta: escríbela en la tarjeta de la etapa antes de evaluarla.");
  });

  it("lo que pasa vuelve al plan; lo cumplido y lo no cumplido se quedan en el ciclo", () => {
    expect(estadoTrasLaDecision("pasa")).toEqual({ estado: "en_plan", alPlan: true });
    expect(estadoTrasLaDecision("cumplido")).toEqual({ estado: "cumplido", alPlan: false });
    expect(estadoTrasLaDecision("descartado")).toEqual({ estado: "descartado", alPlan: false });
  });
});

describe("lo que queda guardado", () => {
  it("el cierre se lee de vuelta igual, con sus documentos congelados", () => {
    const cierre = armarCierre(completo, [{ slug: "diagnosis", nombre: "Diagnóstico", canvasId: "cv1", versionId: "v1" }]);
    expect(leerCierre(JSON.parse(JSON.stringify(cierre)))).toEqual(cierre);
    expect(cierre.casos.map((c) => c.decision)).toEqual(["no_cumplido", "pasa", "descartado"]);
    expect(leerCierre({ formato: 9 })).toBeNull();
  });
});

describe("la guía del CSE en Aprendizaje", () => {
  const base = { etapa: "aprendizaje" as const, meta: completo.meta, desde: "2026-09-01", hasta: "2026-10-30", casos: completo.casos };

  it("sin el borrador, no marca nada (nunca como hecho); con el borrador completo, todo hecho", () => {
    const sin = Object.fromEntries(guiaDelCiclo(GUIA_SMARTLOOP, base).producido.map((p) => [p.clave, p.hecho]));
    expect(sin).toEqual({ "criterios-medidos": null, "meta-evaluada": null, "pendientes-decididos": null, "siguiente-ciclo": null });
    const con = guiaDelCiclo(GUIA_SMARTLOOP, { ...base, aprendizaje: { metaResultado: "parcial", siguienteCiclo: "Seguir" } });
    expect(con.producido.every((p) => p.hecho === true)).toBe(true);
    expect(con.primeroQueFalta).toBeNull();
  });

  it("lo que falta se ve en el orden de la guía", () => {
    const c = comprobacionesDelAprendizaje({ ...completo, casos: [{ ...completo.casos[0], criterioMedido: null }], metaResultado: null });
    expect(c).toEqual({ "criterios-medidos": false, "meta-evaluada": false, "pendientes-decididos": true, "siguiente-ciclo": true });
  });

  it("en Planificación, la versión aprobada se comprueba solo si quien llama la sabe", () => {
    const plan = { ...base, etapa: "planificacion" as const };
    const sin = guiaDelCiclo(GUIA_SMARTLOOP, plan).producido.find((p) => p.clave === "version-aprobada");
    const no = guiaDelCiclo(GUIA_SMARTLOOP, { ...plan, aprobada: false }).producido.find((p) => p.clave === "version-aprobada");
    const si = guiaDelCiclo(GUIA_SMARTLOOP, { ...plan, aprobada: true }).producido.find((p) => p.clave === "version-aprobada");
    expect([sin?.hecho, no?.hecho, si?.hecho]).toEqual([null, false, true]);
  });
});
