import { describe, expect, it } from "vitest";
import {
  avisoDeLasPropuestas,
  estadoDeLaPropuesta,
  lineaDeLaPropuesta,
  ordenarPropuestas,
  propuestaDestacada,
  queCambia,
  razonDelRiesgo,
  rutaDeLaPropuesta,
  type PropuestaDelVigia,
} from "./propuestas-del-vigia";

const prop = (x: Partial<PropuestaDelVigia> & Pick<PropuestaDelVigia, "projectId">): PropuestaDelVigia => ({
  proyecto: `Proyecto ${x.projectId}`,
  clientId: `c-${x.projectId}`,
  cuenta: `Cuenta ${x.projectId}`,
  cse: null,
  actual: "EN_FRICCION",
  propuesta: "EN_RIESGO",
  razon: "1 fase vencida",
  desde: "2026-10-10T00:00:00.000Z",
  ...x,
});

describe("qué propone, en palabras", () => {
  it("dice la salud de hoy y la propuesta, no «el estado»", () => {
    const p = prop({ projectId: "a", proyecto: "Areya - MKT + CRM" });
    expect(queCambia(p)).toBe("de «En fricción» a «En riesgo»");
    expect(lineaDeLaPropuesta(p)).toBe("Areya - MKT + CRM: de «En fricción» a «En riesgo»");
  });
});

describe("razonDelRiesgo: por qué, con las señales de hoy", () => {
  it("varias fases vencidas y sin avance", () => {
    expect(
      razonDelRiesgo({ overduePhases: 3, worstOverduePhase: { name: "Integración En Control", daysLate: 48 }, stalled: true, daysSinceActivity: 31 }),
    ).toBe("3 fases vencidas; la peor, «Integración En Control», va 48 días tarde · sin avance hace 31 días");
  });
  it("una sola fase vencida", () => {
    expect(razonDelRiesgo({ overduePhases: 1, worstOverduePhase: { name: "Semana 0", daysLate: 6 }, stalled: false, daysSinceActivity: 2 })).toBe(
      "1 fase vencida: «Semana 0» va 6 días tarde",
    );
  });
  it("solo sin avance", () => {
    expect(razonDelRiesgo({ overduePhases: 0, worstOverduePhase: null, stalled: true, daysSinceActivity: 1 })).toBe("sin avance hace 1 día");
  });
  it("nunca queda vacía", () => {
    expect(razonDelRiesgo({ overduePhases: 0, worstOverduePhase: null, stalled: false, daysSinceActivity: null })).toBe("señales del cronograma");
  });
});

describe("estadoDeLaPropuesta: lo decidido o lo que ya no aplica sale del número", () => {
  it("sin propuesta → null", () => {
    expect(estadoDeLaPropuesta({ propuesta: null, saludFijada: null, riskCandidate: true })).toBeNull();
  });
  it("con la salud fijada a mano → ya decidida, aunque siga la señal", () => {
    expect(estadoDeLaPropuesta({ propuesta: "EN_RIESGO", saludFijada: "SALUDABLE", riskCandidate: true })).toBe("ya-decidida");
  });
  it("sin la señal que la hizo proponer → ya no aplica", () => {
    expect(estadoDeLaPropuesta({ propuesta: "EN_RIESGO", saludFijada: null, riskCandidate: false })).toBe("sin-senal");
  });
  it("con la señal y sin decidir → vigente", () => {
    expect(estadoDeLaPropuesta({ propuesta: "EN_RIESGO", saludFijada: null, riskCandidate: true })).toBe("vigente");
  });
});

describe("avisoDeLasPropuestas: la línea de «Para ti»", () => {
  it("sin propuestas no hay línea", () => {
    expect(avisoDeLasPropuestas([])).toBeNull();
  });

  it("una: la cuenta, el proyecto, de qué a qué y por qué; el botón abre la lista en ella", () => {
    const a = avisoDeLasPropuestas([prop({ projectId: "p1", cuenta: "Areyá", proyecto: "Areya - MKT + CRM", razon: "1 fase vencida" })])!;
    expect(a.titulo).toBe("Areyá · Areya - MKT + CRM: de «En fricción» a «En riesgo»");
    expect(a.detalle).toContain("Por qué: 1 fase vencida.");
    expect(a.titulo).not.toMatch(/estado/i);
    expect(a.href).toBe(rutaDeLaPropuesta("p1"));
    expect(a.href).toBe("/customer-success/propuestas?proyecto=p1");
    expect(a.clientId).toBe("c-p1");
    expect(a.enlaces).toBeUndefined();
  });

  it("nueve en nueve cuentas: una línea, la que más espera primero, y cada una con su enlace a la misma lista", () => {
    const ps = Array.from({ length: 9 }, (_, i) => prop({ projectId: `p${i}`, desde: `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00.000Z` })).reverse();
    const a = avisoDeLasPropuestas(ps)!;
    expect(a.titulo).toBe("El vigía propone pasar 9 proyectos a «En riesgo»");
    expect(a.detalle).toContain("La que más espera: Cuenta p0 · Proyecto p0: de «En fricción» a «En riesgo»");
    expect(a.accion).toBe("Decidir una por una");
    expect(a.href).toBe(rutaDeLaPropuesta("p0"));
    expect(a.enlaces).toHaveLength(9);
    expect(a.enlaces!.every((e) => e.href.startsWith("/customer-success/propuestas?proyecto="))).toBe(true);
    expect(a.clientId).toBeNull();
  });

  it("dos de la misma cuenta: el enlace nombra el proyecto y la línea es de esa cuenta", () => {
    const a = avisoDeLasPropuestas([
      prop({ projectId: "x", clientId: "spec", cuenta: "Spectrum", proyecto: "MKT + SALES" }),
      prop({ projectId: "y", clientId: "spec", cuenta: "Spectrum", proyecto: "Service Hub", desde: "2026-10-12T00:00:00.000Z" }),
    ])!;
    expect(a.titulo).toBe("El vigía propone pasar 2 proyectos a «En riesgo» de Spectrum");
    expect(a.enlaces!.map((e) => e.texto)).toEqual(["Spectrum · MKT + SALES", "Spectrum · Service Hub"]);
    expect(a.clientId).toBe("spec");
  });
});

describe("orden y destacada", () => {
  it("la que más espera primero; sin fecha, al final", () => {
    const ps = ordenarPropuestas([
      prop({ projectId: "b", desde: null }),
      prop({ projectId: "c", desde: "2026-10-12T00:00:00.000Z" }),
      prop({ projectId: "a", desde: "2026-10-06T00:00:00.000Z" }),
    ]);
    expect(ps.map((p) => p.projectId)).toEqual(["a", "c", "b"]);
  });
  it("resalta la pedida si sigue en la lista; si ya se decidió, la primera", () => {
    const ps = [prop({ projectId: "a" }), prop({ projectId: "b" })];
    expect(propuestaDestacada(ps, "b")).toBe("b");
    expect(propuestaDestacada(ps, "decidida")).toBe("a");
    expect(propuestaDestacada([], "b")).toBeNull();
  });
});
