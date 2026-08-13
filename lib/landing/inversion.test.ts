/**
 * lib/landing/inversion.test.ts
 *
 * Lo que este archivo protege es UNA cosa: que a un cliente NO le cambie el documento que
 * ya vio. `configForSnapshot` resuelve por key contra la config viva, así que toda
 * propuesta publicada estrena el renderer unificado — y estas dos reglas son lo único que
 * se interpone.
 */
import { describe, it, expect } from "vitest";
import {
  adoptarShapeNuevo,
  esInversionLegacy,
  gruposDeInversion,
  INVERSION_LEGACY_KEYS,
  type InversionData,
} from "./inversion";

const legacyReal: InversionData = {
  licenciasHubspot: { monto: "A definir en propuesta formal", detalle: "Hubs × usuarios" },
  implementacion: { monto: "$12,000–18,000", detalle: "Set up + onboarding" },
  nota: "",
};

describe("esInversionLegacy: qué propuestas siguen viendo las dos tarjetas", () => {
  it("el shape viejo con contenido → rama legacy", () => {
    expect(esInversionLegacy(legacyReal)).toBe(true);
    // Con solo el detalle escrito ya cuenta: el monto puede estar por definirse.
    expect(esInversionLegacy({ implementacion: { monto: "", detalle: "Set up" } })).toBe(true);
  });

  it("el shape viejo VACÍO no es legacy (una sección recién creada usa la tabla nueva)", () => {
    expect(esInversionLegacy({ licenciasHubspot: { monto: "", detalle: "" } })).toBe(false);
    expect(esInversionLegacy({})).toBe(false);
    expect(esInversionLegacy(null)).toBe(false);
  });

  it("con contenido en el shape NUEVO nunca es legacy, aunque arrastre las keys viejas", () => {
    expect(esInversionLegacy({ ...legacyReal, lineas: [{ concepto: "Diseño", monto: "$500" }] })).toBe(false);
    expect(esInversionLegacy({ ...legacyReal, licencias: [{ concepto: "Content Hub", monto: "$450" }] })).toBe(false);
  });

  it("las keys legacy están declaradas donde se pueden leer", () => {
    expect([...INVERSION_LEGACY_KEYS]).toEqual(["licenciasHubspot", "implementacion"]);
  });
});

describe("adoptarShapeNuevo: la conversión que aprieta una persona, nunca un script", () => {
  it("mapea las dos tarjetas a una línea de cada grupo", () => {
    const out = adoptarShapeNuevo(legacyReal);
    expect(out.lineas).toEqual([
      { concepto: "Implementación Smarteam", monto: "$12,000–18,000", detalle: "Set up + onboarding" },
    ]);
    expect(out.licencias).toEqual([
      { concepto: "Licencias HubSpot", monto: "A definir en propuesta formal", detalle: "Hubs × usuarios" },
    ]);
    expect(esInversionLegacy(out)).toBe(false); // ya no vuelve a la rama vieja
  });

  it("una tarjeta vacía no crea una línea en blanco", () => {
    const out = adoptarShapeNuevo({ implementacion: { monto: "$1,000", detalle: "" } } as InversionData);
    expect(out.licencias).toEqual([]);
    expect(out.lineas).toHaveLength(1);
  });
});

describe("gruposDeInversion: cuántos totales se pintan", () => {
  it("sin montos no se pinta nada (comportamiento de hoy)", () => {
    const g = gruposDeInversion({ lineas: [{ concepto: "Diseño", monto: "" }] });
    expect(g.gruposConMonto).toBe(0);
    expect(g.servicios.total).toBeNull();
    expect(g.granTotal).toBeNull();
  });

  /* ⚠ EL caso de las propuestas de sitio web publicadas: solo tienen `lineas`, así que hay
     UN grupo → un solo total, con la píldora de siempre, y NINGÚN gran total nuevo. */
  it("un solo grupo: un total y CERO gran total", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ monto: "250" }, { monto: "465" }, { monto: "1800" }, { monto: "280" }, { monto: "1100" }, { monto: "320" }],
    });
    expect(g.gruposConMonto).toBe(1);
    expect(g.servicios.total).toEqual({ min: 4215, max: 4215 });
    expect(g.licencias.total).toBeNull();
    expect(g.granTotal).toBeNull();
  });

  it("dos grupos: subtotal por grupo + gran total", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ monto: "$10,000" }],
      licencias: [{ monto: "$3,600" }],
    });
    expect(g.gruposConMonto).toBe(2);
    expect(g.servicios.total).toEqual({ min: 10000, max: 10000 });
    expect(g.licencias.total).toEqual({ min: 3600, max: 3600 });
    expect(g.granTotal).toEqual({ min: 13600, max: 13600 });
  });

  it("los rangos se propagan al gran total", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ monto: "$5,600–6,650" }],
      licencias: [{ monto: "$1,000" }],
    });
    expect(g.granTotal).toEqual({ min: 6600, max: 7650 });
  });

  it("los pendientes se cuentan por grupo y en total, para poder avisarlos", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ monto: "$10,000" }, { monto: "Included" }],
      licencias: [{ monto: "A definir" }],
    });
    expect(g.servicios.pendientes).toBe(1);
    expect(g.licencias.pendientes).toBe(1);
    expect(g.pendientesTotales).toBe(2);
    // El grupo de licencias no aportó ningún monto → un solo grupo → sin gran total.
    expect(g.gruposConMonto).toBe(1);
    expect(g.granTotal).toBeNull();
  });

  it("extras y recurrentes NUNCA entran a ningún total", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ monto: "$1,000" }],
      extras: [{ monto: "$5,000" }],
      recurrentes: [{ monto: "$450" }],
    });
    expect(g.servicios.total).toEqual({ min: 1000, max: 1000 });
    expect(g.granTotal).toBeNull();
  });
});
