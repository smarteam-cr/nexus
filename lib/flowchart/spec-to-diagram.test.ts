/**
 * lib/flowchart/spec-to-diagram.test.ts
 *
 * Fija el conversor determinístico spec → diagrama del canvas Desarrollo:
 * la spec viene STRING-ONLY del agente (coerceToSchema) y de acá tiene que
 * salir SIEMPRE un FlowchartData válido — ids únicos, cero edges huérfanos,
 * enums validados con default, pending parseado de string.
 */
import { describe, it, expect } from "vitest";
import { slugId, specToDiagram, relacionToDiagram, cadenaToDiagram } from "./spec-to-diagram";

describe("slugId", () => {
  it("genera ids estables: lowercase, sin acentos, guiones", () => {
    expect(slugId("HubSpot")).toBe("hubspot");
    expect(slugId("  Facturación / ERP  ")).toBe("facturacion-erp");
    expect(slugId("SAP Business One")).toBe("sap-business-one");
  });

  it("nombre vacío o sin alfanuméricos → fallback estable", () => {
    expect(slugId("")).toBe("nodo");
    expect(slugId("¿?¡!")).toBe("nodo");
  });
});

describe("specToDiagram (arquitectura: sistemas + conexiones)", () => {
  const spec = {
    intro: "HubSpot manda negocios cerrados al ERP.",
    sistemas: [
      { nombre: "HubSpot", rol: "CRM", color: "#f97316", detalle: "hs_object_id para PATCH/UPSERT" },
      { nombre: "Conector", rol: "Middleware", color: "", detalle: "" },
      { nombre: "SAP", rol: "ERP", color: "naranja", detalle: "External ID en propiedad Única" },
    ],
    conexiones: [
      {
        desde: "HubSpot", hacia: "Conector", titulo: "Negocio cerrado",
        dataFields: "Negocio/Empresa/Contacto", dedupeKey: "email", cuando: "Cerrado Ganado",
        direction: "to", syncType: "realtime", pending: "",
      },
      {
        desde: "conector", hacia: " SAP ", titulo: "Orden de venta",
        dataFields: "", dedupeKey: "", cuando: "", direction: "bidir", syncType: "batch", pending: "si",
      },
    ],
  };

  it("spec completa → grafo con ids, edges y metadatos correctos", () => {
    const { diagram, discarded } = specToDiagram(spec);
    expect(discarded).toBe(0);
    expect(diagram.kind).toBe("integration");
    expect(diagram.nodes.map((n) => n.id)).toEqual(["hubspot", "conector", "sap"]);
    expect(diagram.nodes[0]).toEqual({
      id: "hubspot", type: "system", label: "HubSpot", sublabel: "CRM",
      detail: "hs_object_id para PATCH/UPSERT", systemColor: "#f97316",
    });
    // Color inválido ("naranja") y campos vacíos → keys ausentes, no strings vacíos.
    expect(diagram.nodes[2]).toEqual({
      id: "sap", type: "system", label: "SAP", sublabel: "ERP", detail: "External ID en propiedad Única",
    });
    expect(diagram.nodes.every((n) => n.position === undefined)).toBe(true);

    expect(diagram.edges).toHaveLength(2);
    expect(diagram.edges[0]).toEqual({
      id: "e0", source: "hubspot", target: "conector",
      label: "Negocio cerrado · Negocio/Empresa/Contacto",
      direction: "to", syncType: "realtime",
      dataFields: "Negocio/Empresa/Contacto", dedupeKey: "email", trigger: "Cerrado Ganado",
    });
    // Matching fuzzy: "conector" (lowercase) y " SAP " (con espacios) matchean igual.
    expect(diagram.edges[1]).toEqual({
      id: "e1", source: "conector", target: "sap",
      label: "Orden de venta", direction: "bidir", syncType: "batch", pending: true,
    });
  });

  it("conexión huérfana (sistema inexistente) → descartada y contada", () => {
    const { diagram, discarded } = specToDiagram({
      sistemas: [{ nombre: "HubSpot" }],
      conexiones: [
        { desde: "HubSpot", hacia: "Netsuite", titulo: "x" },
        { desde: "", hacia: "HubSpot", titulo: "y" },
      ],
    });
    expect(diagram.edges).toEqual([]);
    expect(discarded).toBe(2);
  });

  it("direction/syncType inválidos → defaults ('to' / sin syncType)", () => {
    const { diagram } = specToDiagram({
      sistemas: [{ nombre: "A" }, { nombre: "B" }],
      conexiones: [{ desde: "A", hacia: "B", titulo: "x", direction: "ambos", syncType: "cada hora" }],
    });
    expect(diagram.edges[0].direction).toBe("to");
    expect(diagram.edges[0].syncType).toBeUndefined();
  });

  it("pending 'si'/'Sí'/'' → true/true/undefined", () => {
    const conexiones = [
      { desde: "A", hacia: "B", titulo: "x", pending: "si" },
      { desde: "A", hacia: "B", titulo: "x", pending: "Sí" },
      { desde: "A", hacia: "B", titulo: "x", pending: "" },
      { desde: "A", hacia: "B", titulo: "x", pending: "no" },
    ];
    const { diagram } = specToDiagram({ sistemas: [{ nombre: "A" }, { nombre: "B" }], conexiones });
    expect(diagram.edges.map((e) => e.pending)).toEqual([true, true, undefined, undefined]);
  });

  it("sistemas con slug duplicado → ids únicos con sufijo", () => {
    const { diagram } = specToDiagram({
      sistemas: [{ nombre: "HubSpot" }, { nombre: "hubspot" }, { nombre: "HUBSPOT" }],
      conexiones: [],
    });
    expect(diagram.nodes.map((n) => n.id)).toEqual(["hubspot", "hubspot-2", "hubspot-3"]);
  });

  it("spec vacía / basura → nodes y edges vacíos, sin throw", () => {
    for (const spec of [{}, null, undefined, "x", 42, { sistemas: "no", conexiones: "no" }]) {
      const { diagram, discarded } = specToDiagram(spec);
      expect(diagram.nodes).toEqual([]);
      expect(diagram.edges).toEqual([]);
      expect(discarded).toBe(0);
      expect(diagram.kind).toBe("integration");
    }
  });
});

describe("relacionToDiagram (objetos + asociaciones)", () => {
  it("objetos → nodos con equivalencia; cardinalidad con '↔' → bidir", () => {
    const { diagram, discarded } = relacionToDiagram({
      objetos: [
        { nombre: "Empresa", equivale: "Cliente en el ERP", detalle: "Dedupe por dominio" },
        { nombre: "Negocio", equivale: "Cotización", detalle: "" },
      ],
      asociaciones: [
        { desde: "Empresa", hacia: "Negocio", cardinalidad: "1 Empresa ↔ 1 cliente ERP", detalle: "Se sincroniza el fiscal", pending: "" },
        { desde: "Negocio", hacia: "Empresa", cardinalidad: "N Negocios → cotizaciones", detalle: "", pending: "sí" },
      ],
    });
    expect(discarded).toBe(0);
    expect(diagram.kind).toBe("integration");
    expect(diagram.nodes[0]).toEqual({
      id: "empresa", type: "system", label: "Empresa", sublabel: "Cliente en el ERP", detail: "Dedupe por dominio",
    });
    expect(diagram.edges[0]).toEqual({
      id: "e0", source: "empresa", target: "negocio",
      label: "1 Empresa ↔ 1 cliente ERP", direction: "bidir", dataFields: "Se sincroniza el fiscal",
    });
    expect(diagram.edges[1]).toEqual({
      id: "e1", source: "negocio", target: "empresa",
      label: "N Negocios → cotizaciones", direction: "to", pending: true,
    });
  });

  it("asociación huérfana → descartada y contada; spec vacía → []", () => {
    const { diagram, discarded } = relacionToDiagram({
      objetos: [{ nombre: "Contacto" }],
      asociaciones: [{ desde: "Contacto", hacia: "Factura", cardinalidad: "1:1" }],
    });
    expect(diagram.edges).toEqual([]);
    expect(discarded).toBe(1);

    const empty = relacionToDiagram({});
    expect(empty.diagram.nodes).toEqual([]);
    expect(empty.diagram.edges).toEqual([]);
  });
});

describe("cadenaToDiagram (legacy tech_architecture)", () => {
  it("cadena lineal: 3 pasos → 3 nodes + 2 edges consecutivos sin label", () => {
    const diagram = cadenaToDiagram({
      intro: "x",
      cadena: [
        { actor: "HubSpot", titulo: "Emite el webhook", detalle: "hs_object_id" },
        { actor: "Middleware", titulo: "Transforma", detalle: "" },
        { actor: "", titulo: "ERP recibe", detalle: "" },
      ],
    });
    expect(diagram.kind).toBe("integration");
    expect(diagram.nodes).toHaveLength(3);
    expect(diagram.nodes[0]).toEqual({
      id: "hubspot", type: "system", label: "HubSpot", sublabel: "Emite el webhook", detail: "hs_object_id",
    });
    // Sin actor → titulo como label, sin sublabel.
    expect(diagram.nodes[2]).toEqual({ id: "erp-recibe", type: "system", label: "ERP recibe" });
    expect(diagram.edges).toEqual([
      { id: "e0", source: "hubspot", target: "middleware", direction: "to" },
      { id: "e1", source: "middleware", target: "erp-recibe", direction: "to" },
    ]);
  });

  it("fallback v1: sin cadena usa nodos/flujos (match por nombre, descripcion como label)", () => {
    const diagram = cadenaToDiagram({
      cadena: [],
      nodos: [
        { nombre: "HubSpot", rol: "CRM", detalle: "d1" },
        { nombre: "Odoo", rol: "ERP", detalle: "" },
      ],
      flujos: [
        { desde: "hubspot", hacia: "Odoo", descripcion: "Órdenes de venta" },
        { desde: "HubSpot", hacia: "Zapier", descripcion: "huérfano" },
      ],
    });
    expect(diagram.nodes.map((n) => n.id)).toEqual(["hubspot", "odoo"]);
    expect(diagram.nodes[0].sublabel).toBe("CRM");
    // El flujo huérfano (Zapier no existe) se descarta en silencio.
    expect(diagram.edges).toEqual([
      { id: "e0", source: "hubspot", target: "odoo", label: "Órdenes de venta", direction: "to" },
    ]);
  });

  it("data vacía o basura → nodes/edges vacíos", () => {
    for (const d of [{}, null, undefined, { cadena: "x", nodos: "y", flujos: 3 }]) {
      const diagram = cadenaToDiagram(d);
      expect(diagram.nodes).toEqual([]);
      expect(diagram.edges).toEqual([]);
    }
  });
});
