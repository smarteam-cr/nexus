/**
 * lib/landing/hubs-solucion.test.ts — congela las decisiones de la sección "Qué se
 * implementa" que, si se rompen, rompen algo que YA está publicado o le devuelven al
 * agente una decisión que no es suya.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  HUB_COLOR_VAR,
  HUB_NEUTRAL_VAR,
  SOLUCION_LEGACY_KEYS,
  columnaKey,
  columnasActivas,
  esSolucionLegacy,
  hubColumnas,
  hubVisual,
  parseCanales,
} from "./hubs-solucion";
import { HUBSPOT_HUB_SLUGS } from "@/lib/tags/catalog";
import { BC_DEF_BY_KEY } from "@/components/landing/configs/business-case.defs";
import type { HubsClienteData } from "@/components/landing/types";

const conColumnas = (hubs: string[]): HubsClienteData => ({
  intro: "",
  columnas: hubs.map((h) => ({ hub: h, titulo: h, items: [] })),
});

describe("legacy vs. Hubs — la rama que sostiene lo ya publicado", () => {
  it("con columnas NO es legacy, aunque arrastre el texto viejo", () => {
    expect(esSolucionLegacy({ ...conColumnas(["sales_hub"]), hubs: "Sales / Marketing" })).toBe(false);
  });

  it("sin columnas y con texto viejo SÍ es legacy", () => {
    for (const k of SOLUCION_LEGACY_KEYS) {
      expect(esSolucionLegacy({ intro: "", columnas: [], [k]: "algo" } as HubsClienteData)).toBe(true);
    }
  });

  // Es el caso de una propuesta recién creada: sin esto caería en legacy y pintaría
  // cuatro tarjetas vacías en vez de la sección nueva.
  it("una sección VACÍA no es legacy", () => {
    expect(esSolucionLegacy({ intro: "", columnas: [] })).toBe(false);
    expect(esSolucionLegacy(undefined)).toBe(false);
    expect(esSolucionLegacy({ intro: "", columnas: [], hubs: "   " } as HubsClienteData)).toBe(false);
  });
});

describe("hubColumnas sanea sin reventar", () => {
  it("descarta lo que no tiene forma de columna", () => {
    const data = { intro: "", columnas: [null, "texto", 3, { hub: "sales_hub", titulo: "Ventas", items: [] }] };
    expect(hubColumnas(data as unknown as HubsClienteData)).toHaveLength(1);
  });

  it("un `columnas` que no es array da lista vacía", () => {
    expect(hubColumnas({ intro: "", columnas: "Sales Hub" } as unknown as HubsClienteData)).toEqual([]);
  });
});

describe("los nombres viejos de HubSpot resuelven al Hub vigente", () => {
  it("operations_hub y commerce_hub caen en su color actual", () => {
    expect(hubVisual("operations_hub").colorVar).toBe(HUB_COLOR_VAR.data_hub);
    expect(hubVisual("commerce_hub").colorVar).toBe(HUB_COLOR_VAR.revenue_hub);
    expect(hubVisual("CMS Hub").colorVar).toBe(HUB_COLOR_VAR.content_hub);
  });

  it("el rótulo lo escribe el catálogo, no el agente", () => {
    expect(hubVisual("Sales Hub").label).toBe("Sales Hub");
  });

  it("una columna que no es un Hub va al neutro y sin rótulo impuesto", () => {
    expect(hubVisual("Custom Agent WhatsApp")).toEqual({ colorVar: HUB_NEUTRAL_VAR, label: null });
    expect(hubVisual("")).toEqual({ colorVar: HUB_NEUTRAL_VAR, label: null });
  });

  it("todo Hub del catálogo tiene color; ninguno de más", () => {
    expect(Object.keys(HUB_COLOR_VAR).sort()).toEqual([...HUBSPOT_HUB_SLUGS].sort());
  });

  // El mapa vive en TS y los hex en el CSS: sin este escaneo, un Hub nuevo podría
  // declarar una variable que nadie definió y la columna saldría sin color, en silencio.
  // (Que el color SEA legible lo vigila lib/ui/landing-brand-contrast.test.ts.)
  it("cada variable de color está declarada en app/landing-engine.css", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "app", "landing-engine.css"), "utf8");
    for (const v of [...Object.values(HUB_COLOR_VAR), HUB_NEUTRAL_VAR]) {
      expect(css, `${v} no está declarada en app/landing-engine.css`).toContain(`${v}:`);
    }
  });
});

describe("la curaduría del CSE", () => {
  it("sin `activos` van TODAS (una generación recién hecha no está curada)", () => {
    expect(columnasActivas(hubColumnas(conColumnas(["sales_hub", "data_hub"])), undefined)).toHaveLength(2);
  });

  it("`activos` vacío es una decisión: no va ninguna", () => {
    expect(columnasActivas(hubColumnas(conColumnas(["sales_hub"])), [])).toHaveLength(0);
  });

  // Si el agente re-escribe "Data Hub" donde antes decía "operations_hub", apagar tiene
  // que seguir apagado: por eso `activos` se compara normalizado y no por string crudo.
  it("apagar sobrevive a que el Hub cambie de nombre", () => {
    const data: HubsClienteData = { ...conColumnas(["Data Hub", "sales_hub"]), activos: ["sales_hub"] };
    expect(columnasActivas(hubColumnas(data), data.activos).map((c) => c.hub)).toEqual(["sales_hub"]);
    expect(columnaKey({ hub: "operations_hub", titulo: "", items: [] })).toBe("data_hub");
  });

  it("una columna sin hub se identifica por su título", () => {
    expect(columnaKey({ hub: "", titulo: "Breeze", items: [] })).toBe("Breeze");
  });

  // El caso NORMAL desde que la sección lleva una columna por cada Hub: las seis
  // existen y `activos` —sembrado desde los tags en `generate`— dice cuáles se
  // vendieron. Las otras cuatro siguen ahí para que el cliente las explore.
  it("con las seis columnas, solo las vendidas quedan activas", () => {
    const data: HubsClienteData = {
      ...conColumnas([...HUBSPOT_HUB_SLUGS]),
      activos: ["marketing_hub", "sales_hub"],
    };
    const columnas = hubColumnas(data);
    expect(columnas).toHaveLength(6);
    expect(columnasActivas(columnas, data.activos).map((c) => c.hub)).toEqual([
      "marketing_hub",
      "sales_hub",
    ]);
  });
});

describe("canales", () => {
  it("parte el CSV y descarta lo vacío", () => {
    expect(parseCanales("LinkedIn, Meta ,, correo")).toEqual(["LinkedIn", "Meta", "correo"]);
    expect(parseCanales("")).toEqual([]);
    expect(parseCanales(undefined)).toEqual([]);
  });
});

// La invariante medular: el agente NO decide qué le vendieron al cliente. La sostiene el
// tipo (coerceToSchema descarta lo que no está en `properties`), no un pedido en el brief.
describe("`activos` está FUERA del schema de la sección", () => {
  const props = (BC_DEF_BY_KEY.solucion.schema as { properties: Record<string, unknown> }).properties;

  it("el agente no puede escribir `activos`", () => {
    expect(Object.keys(props)).not.toContain("activos");
  });

  it("y las 4 keys legacy tampoco vuelven al schema", () => {
    for (const k of SOLUCION_LEGACY_KEYS) expect(Object.keys(props)).not.toContain(k);
  });
});
