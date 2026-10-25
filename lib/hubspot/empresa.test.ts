/**
 * lib/hubspot/empresa.test.ts — qué se escribiría en la empresa de HubSpot (R2, preparado; hoy no escribe nada).
 */
import { describe, expect, it } from "vitest";
import { definicionesDelPasoUno, ESPEJO_DE_LA_EMPRESA, escrituraHabilitada, PROPIEDADES_NUEVAS_DEL_PASO_UNO, PROPIEDADES_QUE_SE_LEEN, queSeEscribe } from "./empresa";

describe("la bandera", () => {
  it("está apagada salvo con EMPRESA_HUBSPOT_ESCRITURA=1", () => {
    expect(escrituraHabilitada({})).toBe(false);
    expect(escrituraHabilitada({ EMPRESA_HUBSPOT_ESCRITURA: "0" })).toBe(false);
    expect(escrituraHabilitada({ EMPRESA_HUBSPOT_ESCRITURA: "1" })).toBe(true);
  });
});

describe("queSeEscribe", () => {
  it("lo que calcula Nexus se escribe; lo que vino de HubSpot no vuelve (eco)", () => {
    expect(queSeEscribe({ clave: "tamUsd", valor: 41760, fuente: "nexus", enHubspot: "" })).toEqual({ propiedad: "tam__potencial", valor: "41760" });
    expect(queSeEscribe({ clave: "empleados", valor: 240, fuente: "hubspot", enHubspot: "" })).toBeNull();
  });

  it("lo estándar: lo decidido por una persona se escribe; lo de la IA, solo si HubSpot está vacío", () => {
    expect(queSeEscribe({ clave: "empleados", valor: 310, fuente: "persona", enHubspot: "240" })).toEqual({ propiedad: "numberofemployees", valor: "310" });
    expect(queSeEscribe({ clave: "empleados", valor: 310, fuente: "investigacion", enHubspot: "240" })).toBeNull();
    expect(queSeEscribe({ clave: "empleados", valor: 310, fuente: "investigacion", enHubspot: null })).toEqual({ propiedad: "numberofemployees", valor: "310" });
  });

  it("lo que ya tiene el mismo valor, lo que solo se lee y lo vacío no se escriben", () => {
    expect(queSeEscribe({ clave: "pais", valor: "Costa Rica", fuente: "persona", enHubspot: "Costa Rica" })).toBeNull();
    expect(queSeEscribe({ clave: "sitioWeb", valor: "a.com", fuente: "persona", enHubspot: "" })).toBeNull();
    expect(queSeEscribe({ clave: "segmento", valor: "corporativo", fuente: "persona", enHubspot: "" })).toBeNull();
    expect(queSeEscribe({ clave: "trafico", valor: null, fuente: "persona", enHubspot: "" })).toBeNull();
  });
});

describe("las propiedades", () => {
  it("el paso uno crea solo listas y fechas, nunca texto libre, y cada una tiene su dato o su razón", () => {
    const defs = definicionesDelPasoUno();
    expect(defs.map((d) => d.name)).toEqual([...PROPIEDADES_NUEVAS_DEL_PASO_UNO]);
    for (const d of defs) {
      expect(["enumeration", "date"], d.name).toContain(d.type);
      if (d.type === "enumeration") expect(d.options!.length, d.name).toBeGreaterThanOrEqual(2);
    }
  });

  it("se leen las que existen y no son solo de escritura", () => {
    expect(PROPIEDADES_QUE_SE_LEEN).toEqual(expect.arrayContaining(["numberofemployees", "annualrevenue", "country", "domain", "industria__smarteam_", "industry"]));
    expect(PROPIEDADES_QUE_SE_LEEN).not.toContain("tam__potencial");
    expect(ESPEJO_DE_LA_EMPRESA.every((c) => c.propiedad)).toBe(true);
  });
});
