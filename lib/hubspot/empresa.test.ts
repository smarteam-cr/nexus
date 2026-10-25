/**
 * lib/hubspot/empresa.test.ts — el espejo de los datos de la empresa con HubSpot (R2): qué se escribe, cómo va el valor
 * allá y las propiedades nuevas.
 */
import { describe, expect, it } from "vitest";
import {
  claveDeOpcion,
  datoDeLaPropiedad,
  definicionesDeLasPropiedadesNuevas,
  ESPEJO_DE_LA_EMPRESA,
  escrituraHabilitada,
  PROPIEDADES_NUEVAS,
  PROPIEDADES_QUE_SE_LEEN,
  queSeEscribe,
  valorDesdeHubspot,
  valorParaHubspot,
} from "./empresa";
import { CATALOGO_DE_DATOS } from "@/lib/clients/datos-de-la-empresa";

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

  it("lo que ya tiene el mismo valor (también «240.0» contra 240), lo que solo se lee y lo vacío no se escriben", () => {
    expect(queSeEscribe({ clave: "pais", valor: "Costa Rica", fuente: "persona", enHubspot: "Costa Rica" })).toBeNull();
    expect(queSeEscribe({ clave: "facturacionAnualUsd", valor: 240, fuente: "persona", enHubspot: "240.0" })).toBeNull();
    expect(queSeEscribe({ clave: "sitioWeb", valor: "a.com", fuente: "persona", enHubspot: "" })).toBeNull();
    expect(queSeEscribe({ clave: "segmento", valor: "corporativo", fuente: "persona", enHubspot: "" })).toBeNull();
    expect(queSeEscribe({ clave: "trafico", valor: null, fuente: "persona", enHubspot: "" })).toBeNull();
  });

  it("una opción de una propiedad nueva va con su clave; la de una lista que ya existía, tal cual", () => {
    expect(queSeEscribe({ clave: "perfilCierre", valor: "con equipo", fuente: "persona", enHubspot: "" })).toEqual({ propiedad: "nexus_perfil_cierre", valor: "con_equipo" });
    expect(queSeEscribe({ clave: "perfilDespues", valor: "única", fuente: "persona", enHubspot: "" })).toEqual({ propiedad: "nexus_perfil_despues", valor: "unica" });
    expect(queSeEscribe({ clave: "industriaSmarteam", valor: "Retail Especializado", fuente: "persona", enHubspot: "" })).toEqual({
      propiedad: "industria__smarteam_",
      valor: "Retail Especializado",
    });
    // Lo que una persona decidió en Nexus se escribe aunque allá haya otra cosa; lo de la IA de un dato de persona, no.
    expect(queSeEscribe({ clave: "trafico", valor: "10k_50k", fuente: "persona", enHubspot: "menos_10k" })).toEqual({ propiedad: "nexus_trafico", valor: "10k_50k" });
    expect(queSeEscribe({ clave: "trafico", valor: "10k_50k", fuente: "investigacion", enHubspot: "menos_10k" })).toBeNull();
  });
});

describe("el valor allá y de vuelta", () => {
  it("cada opción de cada dato hace el viaje de ida y vuelta sin perderse", () => {
    for (const d of CATALOGO_DE_DATOS) {
      if (!d.hubspot || d.tipo !== "opcion") continue;
      for (const o of d.opciones ?? []) {
        expect(valorDesdeHubspot(d.clave, valorParaHubspot(d.clave, o.valor)), `${d.clave}:${o.valor}`).toBe(o.valor);
      }
    }
  });

  it("los números: los enteros sin decimales, y lo que no se entiende queda vacío", () => {
    expect(valorParaHubspot("empleados", 310)).toBe("310");
    expect(valorDesdeHubspot("empleados", "310")).toBe(310);
    expect(valorDesdeHubspot("empleados", "")).toBeNull();
    expect(valorDesdeHubspot("empleados", "muchos")).toBeNull();
    expect(valorDesdeHubspot("trafico", "una_opcion_que_no_existe")).toBeNull();
  });

  it("claveDeOpcion saca tildes y espacios", () => {
    expect(claveDeOpcion("con equipo")).toBe("con_equipo");
    expect(claveDeOpcion("única")).toBe("unica");
    expect(claveDeOpcion("menos_10k")).toBe("menos_10k");
  });
});

describe("las propiedades", () => {
  it("son 14 listas y fechas, nunca texto libre, con opciones únicas", () => {
    const defs = definicionesDeLasPropiedadesNuevas();
    expect(defs).toHaveLength(14);
    expect(new Set(PROPIEDADES_NUEVAS).size).toBe(14);
    for (const d of defs) {
      expect(["enumeration", "date"], d.name).toContain(d.type);
      expect(d.name, d.name).toMatch(/^nexus_[a-z_]+$/);
      expect(d.groupName).toBe("nexus_empresa");
      if (d.type === "enumeration") {
        expect(d.options!.length, d.name).toBeGreaterThanOrEqual(2);
        expect(new Set(d.options!.map((o) => o.value)).size, d.name).toBe(d.options!.length);
        expect(new Set(d.options!.map((o) => o.label)).size, d.name).toBe(d.options!.length);
        for (const o of d.options!) expect(o.value, d.name).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

  it("cada propiedad nueva del catálogo de los datos está entre las que se crean, y con sus mismas opciones", () => {
    const defs = definicionesDeLasPropiedadesNuevas();
    for (const d of CATALOGO_DE_DATOS) {
      if (!d.hubspot || d.hubspot.existe) continue;
      const def = defs.find((x) => x.name === d.hubspot!.propiedad);
      expect(def, d.hubspot.propiedad).toBeTruthy();
      expect(def!.options!.map((o) => o.value)).toEqual((d.opciones ?? []).map((o) => claveDeOpcion(o.valor)));
    }
  });

  it("los rangos de tráfico y de base son los del catálogo, en orden", () => {
    const defs = definicionesDeLasPropiedadesNuevas();
    expect(defs.find((d) => d.name === "nexus_trafico")!.options!.map((o) => o.value)).toEqual(["menos_10k", "10k_50k", "50k_200k", "200k_1m", "mas_1m"]);
    expect(defs.find((d) => d.name === "nexus_base_consentimiento")!.options!.map((o) => o.value)).toEqual(["menos_1k", "1k_10k", "10k_50k", "50k_200k", "mas_200k"]);
  });

  it("se leen las que existen y no son solo de escritura", () => {
    expect(PROPIEDADES_QUE_SE_LEEN).toEqual(expect.arrayContaining(["numberofemployees", "annualrevenue", "country", "domain", "industria__smarteam_", "industry"]));
    expect(PROPIEDADES_QUE_SE_LEEN).not.toContain("tam__potencial");
    expect(ESPEJO_DE_LA_EMPRESA.every((c) => c.propiedad)).toBe(true);
    expect(datoDeLaPropiedad("numberofemployees")).toBe("empleados");
    expect(datoDeLaPropiedad("tam__potencial")).toBeNull();
  });
});
