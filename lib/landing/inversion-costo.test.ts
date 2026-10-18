/**
 * lib/landing/inversion-costo.test.ts — el precio de lista del proveedor, el margen de una licencia y la frontera que lo
 * deja fuera de todo lo que ve el cliente (2026-10-18).
 *
 * Correr: `npx vitest run lib/landing/inversion-costo.test.ts --project unit`.
 *
 * La segunda mitad es un ESCANEO ESTRUCTURAL: si alguien saca `sinLoInterno` del snapshot, del PDF o de la lectura de la
 * propuesta publicada, el precio que Smarteam le paga al proveedor llegaría al prospecto. Se restituye la llamada, no se
 * relaja el test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  CLAVES_INTERNAS_DE_LINEA,
  cadaCostoDe,
  costoDeLinea,
  margenDeLinea,
  quienFacturaDe,
  seccionesSinLoInterno,
  sinLoInterno,
  textoDeMargen,
  tieneLoInterno,
  type LineaConCosto,
} from "./inversion-costo";
import { templateDefsByKey } from "@/components/landing/configs/templates.defs";

const sales: LineaConCosto = {
  concepto: "Sales Hub Pro",
  hub: "sales_hub",
  cantidad: "2",
  precioUnitario: "$100",
  recurrencia: "mensual",
  costoLista: "$150",
  quienFactura: "smarteam",
};

describe("el costo de una línea", () => {
  it("lee un solo monto en la moneda de la sección y sigue la recurrencia de la línea", () => {
    expect(costoDeLinea(sales, "USD")).toEqual({ monto: 150, moneda: "USD", cada: "mensual" });
    expect(cadaCostoDe({ concepto: "Setup", recurrencia: "unica" })).toBe("unica");
    expect(cadaCostoDe({ ...sales, costoCada: "anual" })).toBe("anual");
  });

  it("vacío no es cero, y un rango o un texto no se usan", () => {
    expect(costoDeLinea({ concepto: "x" }, "USD")).toBeNull();
    expect(costoDeLinea({ ...sales, costoLista: "$100–200" }, "USD")).toBe("sucio");
    expect(costoDeLinea({ ...sales, costoLista: "según HubSpot" }, "USD")).toBe("sucio");
  });

  it("un costo en colones dentro de una propuesta en dólares queda sucio si no declara su moneda", () => {
    expect(costoDeLinea({ ...sales, costoLista: "₡80.000" }, "USD")).toBe("sucio");
    expect(costoDeLinea({ ...sales, costoLista: "₡80.000", costoMoneda: "CRC" }, "USD")).toEqual({ monto: 80_000, moneda: "CRC", cada: "mensual" });
  });

  it("quién la factura: solo los dos valores conocidos", () => {
    expect(quienFacturaDe(sales)).toBe("smarteam");
    expect(quienFacturaDe({ quienFactura: "proveedor" })).toBe("proveedor");
    expect(quienFacturaDe({ quienFactura: "otro" })).toBeNull();
    expect(quienFacturaDe({})).toBeNull();
  });
});

describe("el margen de una licencia", () => {
  it("lo cobrado menos lo que se le paga al proveedor, en el mismo período", () => {
    const m = margenDeLinea(sales, "USD");
    expect(m).toMatchObject({ estado: "ok", periodo: "mes", costo: 150, cobrado: { min: 200, max: 200 }, margen: { min: 50, max: 50 }, pct: 25 });
    expect(textoDeMargen(m, "USD")).toBe("Margen: $50 al mes (25 %) · costo $150 al mes");
  });

  it("con contrato anual compara por año, y un costo anual se lleva a mes dividiendo por 12 (no es convertir moneda)", () => {
    expect(margenDeLinea(sales, "USD", "anual")).toMatchObject({ periodo: "año", costo: 1800, cobrado: { min: 2400 } });
    expect(margenDeLinea({ ...sales, costoLista: "$1,800", costoCada: "anual" }, "USD")).toMatchObject({ periodo: "mes", costo: 150 });
  });

  it("cobrar menos que la lista se ve como pérdida", () => {
    const m = margenDeLinea({ ...sales, descuento: "40%" }, "USD");
    expect(m).toMatchObject({ estado: "ok", margen: { min: -30 } });
    expect(textoDeMargen(m, "USD")).toMatch(/^Pierdes: \$30 al mes/);
  });

  it("no compara monedas distintas ni períodos distintos", () => {
    expect(margenDeLinea({ ...sales, costoLista: "₡80.000", costoMoneda: "CRC" }, "USD").estado).toBe("monedas-distintas");
    expect(margenDeLinea({ ...sales, costoCada: "unica" }, "USD").estado).toBe("periodicidad-distinta");
    expect(margenDeLinea({ concepto: "x", monto: "$500", costoLista: "$100", costoCada: "mensual" }, "USD").estado).toBe("periodicidad-distinta");
  });

  it("sin costo, o sin lo que se cobra, lo dice", () => {
    expect(margenDeLinea({ ...sales, costoLista: "" }, "USD").estado).toBe("sin-costo");
    expect(margenDeLinea({ concepto: "x", costoLista: "$10" }, "USD").estado).toBe("sin-precio");
  });
});

describe("la frontera: lo interno nunca cruza al cliente", () => {
  const data = {
    moneda: "USD",
    lineas: [{ concepto: "Implementación", monto: "$5,000" }],
    licencias: [sales, { concepto: "Zapier", monto: "$30", recurrencia: "mensual" }],
    extras: [{ concepto: "Extra", monto: "$10", costoLista: "$5" }],
    nota: "x",
  };

  it("saca las cuatro claves de todos los grupos y deja todo lo demás igual", () => {
    const limpio = sinLoInterno(data);
    expect(tieneLoInterno(limpio)).toBe(false);
    expect(limpio.licencias[0]).toEqual({ concepto: "Sales Hub Pro", hub: "sales_hub", cantidad: "2", precioUnitario: "$100", recurrencia: "mensual" });
    expect(limpio.licencias[1]).toBe(data.licencias[1]);
    expect(limpio.lineas).toBe(data.lineas);
    expect(limpio.nota).toBe("x");
    expect(tieneLoInterno(data)).toBe(true); // no muta lo que recibe
  });

  it("sin nada interno devuelve el mismo objeto, y tolera basura", () => {
    const sinNada = { lineas: [{ concepto: "a" }] };
    expect(sinLoInterno(sinNada)).toBe(sinNada);
    expect(sinLoInterno(null)).toBeNull();
    expect(sinLoInterno("texto")).toBe("texto");
    expect(sinLoInterno({ licencias: "no es lista" })).toEqual({ licencias: "no es lista" });
  });

  it("limpia las secciones enteras, bloque por bloque", () => {
    const secciones = [{ key: "inversion", blocks: [{ blockType: "CARD", data }] }, { key: "hero", blocks: [{ blockType: "CARD", data: { titulo: "x" } }] }];
    expect(tieneLoInterno(seccionesSinLoInterno(secciones))).toBe(false);
  });

  it("la sección de inversión no declara las claves internas en su schema: ningún agente las lee ni las escribe", () => {
    for (const plantilla of ["hubspot_v1", "website_v1"]) {
      const def = templateDefsByKey(plantilla).inversion;
      expect(def, plantilla).toBeDefined();
      expect(def!.agentGenerated, plantilla).toBe(false);
      expect(tieneLoInterno(def!.schema), plantilla).toBe(false);
      expect(tieneLoInterno(def!.empty), plantilla).toBe(false);
    }
  });

  const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), "utf8");
  it.each([
    ["el snapshot que congela «Subir al cliente»", "app/api/business-cases/[id]/publish/route.ts", "sinLoInterno("],
    ["la propuesta publicada que abre el prospecto", "lib/external/business-case-view.ts", "seccionesSinLoInterno("],
    ["el PDF de la propuesta", "lib/print/load-doc.ts", "sinLoInterno("],
  ])("%s pasa por la frontera", (_q, ruta, llamada) => {
    expect(leer(ruta)).toContain(llamada);
  });

  it("el renglón interno del editor solo se monta en edición y solo en licencias", () => {
    const src = leer("components/landing/sections-website.tsx");
    expect(src).toMatch(/\{editable && grupo\.clave === "licencias" && \(\s*<CostoDeLicencia/);
  });

  it("las claves que vigila la frontera son las cuatro que escribe el editor", () => {
    const editor = leer("components/landing/inversion-costo.tsx");
    for (const k of CLAVES_INTERNAS_DE_LINEA) expect(editor).toContain(k);
  });
});
