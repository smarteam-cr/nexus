/**
 * lib/clients/investigacion/pedido.test.ts — la investigación de la empresa solo guarda lo que tiene su enlace (R5).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { HERRAMIENTA_DE_LA_INVESTIGACION, leerLaInvestigacion, pedidoDeLaInvestigacion, venceLaInvestigacion } from "./pedido";

const busqueda = (...urls: string[]) =>
  ({ type: "web_search_tool_result", tool_use_id: "s1", content: urls.map((url) => ({ type: "web_search_result", url, title: "t", encrypted_content: "", page_age: null })) }) as unknown as Anthropic.Messages.ContentBlock;
const uso = { type: "server_tool_use", id: "s1", name: "web_search", input: {} } as unknown as Anthropic.Messages.ContentBlock;
const respuesta = (input: Record<string, unknown>) => ({ type: "tool_use", id: "t1", name: HERRAMIENTA_DE_LA_INVESTIGACION, input }) as unknown as Anthropic.Messages.ContentBlock;

describe("leerLaInvestigacion", () => {
  it("guarda lo que trae un enlace de las búsquedas y descarta lo demás", () => {
    const r = leerLaInvestigacion([
      uso,
      busqueda("https://www.andina.cr/nosotros", "https://linkedin.com/company/andina", "https://linkedin.com/jobs/123"),
      respuesta({
        resumen: "Distribuidora de electrodomésticos.",
        hitos: [
          { texto: "Abre en Honduras", fecha: "2026-05", url: "https://andina.cr/nosotros" },
          { texto: "Inventado", url: "https://otra.com/x" },
        ],
        contrataciones: [{ puesto: "Gerente de comercio electrónico", url: "https://linkedin.com/jobs/123" }],
        tamano: { rango: "201-500", empleados: 310.4, cita: "201-500 empleados", url: "https://linkedin.com/company/andina" },
        datos: {
          industriaSmarteam: { valor: "Retail Especializado", cita: "tiendas de electrodomésticos", url: "https://andina.cr/nosotros" },
          empleados: { valor: 310, cita: "201-500", url: "https://linkedin.com/company/andina" },
          pais: { valor: "Costa Rica", cita: "San José", url: "https://sin-busqueda.com" },
          segmento: { valor: "gobierno", cita: "x", url: "https://andina.cr/nosotros" },
        },
      }),
    ]);
    expect(r).not.toBeNull();
    expect(r!.contenido.hitos).toEqual([{ texto: "Abre en Honduras", fecha: "2026-05", url: "https://andina.cr/nosotros" }]);
    expect(r!.contrataciones).toHaveLength(1);
    expect(r!.tamanoEstimado).toEqual({ empleados: 310, rango: "201-500", cita: "201-500 empleados", url: "https://linkedin.com/company/andina" });
    // El país no trae un enlace de las búsquedas; el segmento no es un dato que la investigación proponga.
    expect(r!.datos.map((d) => d.clave)).toEqual(["industriaSmarteam", "empleados"]);
    expect(r!.sinEnlace).toBe(2);
    expect(r!.busquedas).toBe(1);
    expect(r!.fuentes.map((f) => f.url).sort()).toEqual(["https://andina.cr/nosotros", "https://linkedin.com/company/andina", "https://linkedin.com/jobs/123"]);
  });

  it("sin la herramienta no hay investigación", () => {
    expect(leerLaInvestigacion([uso, busqueda("https://a.com")])).toBeNull();
  });

  it("no inventa el tamaño: sin cifra ni rango, no hay tamaño", () => {
    const r = leerLaInvestigacion([busqueda("https://a.com"), respuesta({ resumen: "x", tamano: { cita: "grande", url: "https://a.com" } })]);
    expect(r!.tamanoEstimado).toBeNull();
  });
});

describe("el pedido", () => {
  it("lleva la búsqueda web acotada y la empresa con su dominio", () => {
    const p = pedidoDeLaInvestigacion({ empresa: "Andina", dominio: "andina.cr", industria: null, pais: "Costa Rica", hoy: "2026-10-24" });
    expect(JSON.stringify(p.tools)).toContain('"max_uses":5');
    expect(String(p.messages[0].content)).toContain("Dominio: andina.cr");
    expect(String(p.system)).toMatch(/Nunca inventes una cifra/);
  });

  it("vence a los 6 meses", () => {
    expect(venceLaInvestigacion(new Date("2026-10-24T12:00:00Z")).toISOString()).toBe("2027-04-24T12:00:00.000Z");
  });
});
