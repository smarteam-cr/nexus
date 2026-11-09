/**
 * lib/sessions/proyecto-por-titulo.test.ts — DENTRO DE UN CLIENTE, EL TÍTULO MANDA EL PROYECTO (etapa U6, 2026-11-07).
 *
 * Correr: `npx vitest run lib/sessions/proyecto-por-titulo.test.ts --project unit`.
 *
 * El caso es kölbi: un cliente con «Kolbi | Ventas», «Kolbi | Marketing» e «Integración con InfoClic | kölbi», y gente
 * que va a reuniones de los tres. Los títulos de abajo son reales (sus reuniones sin proyecto, medidas el 7 nov).
 * La prueba con la base y el clasificador entero está en proyecto-por-titulo.int.test.ts.
 */
import { describe, expect, it } from "vitest";
import { palabrasPropiasDeLosProyectos, proyectoQueNombraElTitulo } from "./proyecto-por-titulo";

const KOLBI = { name: "kölbi", company: "kolbi.cr", siglas: [] };
const PROYECTOS = [
  { id: "ventas", name: "Kolbi | Ventas" },
  { id: "marketing", name: "Kolbi | Marketing" },
  { id: "infoclic", name: "Integración con InfoClic | kölbi" },
];
const proyecto = (titulo: string) => proyectoQueNombraElTitulo(titulo, PROYECTOS, KOLBI).proyectoId;

describe("el título nombra a UN proyecto", () => {
  it("«kölbi Marketing | Campaña» es de Marketing", () => {
    expect(proyecto("kölbi Marketing | Campaña")).toBe("marketing");
  });

  it("títulos reales de kölbi", () => {
    expect(proyecto("Sesiones HB - Marketing | Kolbi & Smarteam")).toBe("marketing");
    expect(proyecto("Sesión Ventas - Reestructuración de Pipelines de ventas | KOLBI & SMARTEAM")).toBe("ventas");
    expect(proyecto("Kölbi ICE Zona 1 | HubSpot Ventas | Implementación con Smarteam")).toBe("ventas");
    expect(proyecto("Integración Hubspot - InfoClic | Kolbi")).toBe("infoclic");
    expect(proyecto("KÖLBI | RENOVACIÓN MARKETING - HUBSPOT")).toBe("marketing");
  });

  it("la palabra es entera, sin acentos ni mayúsculas", () => {
    expect(proyecto("MARKETING digital")).toBe("marketing");
    expect(proyecto("Remarketing de recargas")).toBeNull();
  });
});

describe("si nombra a dos o a ninguno, decide la IA", () => {
  it("dos proyectos: ninguno", () => {
    const r = proyectoQueNombraElTitulo("Plan de acción Ventas y Marketing", PROYECTOS, KOLBI);
    expect(r.proyectoId).toBeNull();
    expect(r.nombrados.map((n) => n.proyectoId).sort()).toEqual(["marketing", "ventas"]);
  });

  it("el nombre del cliente y las palabras genéricas no nombran a nadie", () => {
    expect(proyecto("KÖLBI | HUBSPOT CRM")).toBeNull();
    expect(proyecto("Conexión WhatsApp | Integración")).toBeNull(); // «integración» es de cualquier proyecto
    expect(proyecto("Gestión de campaña Renovaciones Kôlbi")).toBeNull();
    expect(proyecto("Sesiones HB - Sales | Kolbi & Smarteam")).toBeNull(); // «Sales» no es una palabra de «Ventas»
  });
});

describe("las palabras propias de cada proyecto", () => {
  it("sin las del cliente, sin las genéricas y sin las que comparte con otro proyecto", () => {
    const propias = palabrasPropiasDeLosProyectos(
      [...PROYECTOS, { id: "ventas-2", name: "Kolbi | Ventas Zona 2" }],
      KOLBI,
    );
    expect(Object.fromEntries([...propias].map(([id, ws]) => [id, [...ws]]))).toEqual({
      ventas: [],
      marketing: ["marketing"],
      infoclic: ["infoclic"],
      "ventas-2": ["zona"],
    });
  });
});

describe("hacen falta TODAS las palabras propias (medido el 7 nov en los 23 clientes con varios proyectos)", () => {
  it("el nombre corto del cliente no nombra al proyecto que lo lleva: «RCI - Hubspot CRM» no es «WEBs * RCI»", () => {
    const rc = { name: "RC Inmobiliaria", company: null, siglas: [] };
    const ps = [
      { id: "web", name: "WEBs * RCI" },
      { id: "crm", name: "RC Inmobiliaria | CRM" },
    ];
    expect(proyectoQueNombraElTitulo("RCI - Hubspot CRM", ps, rc).proyectoId).toBeNull();
    expect(proyectoQueNombraElTitulo("Alineación | RCI + SMARTEAM", ps, rc).proyectoId).toBeNull();
    expect(proyectoQueNombraElTitulo("WEBs RCI | Revisión del sitio", ps, rc).proyectoId).toBe("web");
  });

  it("«STL: Propuesta Smarteam» no es «SECURE TITLE SERVICE HUB | STL», y «Sitio web» no es «Reportes web»", () => {
    const stl = { name: "Secure Title Latin America", company: null, siglas: [] };
    const ps = [
      { id: "service", name: "SECURE TITLE SERVICE HUB | STL" },
      { id: "api", name: "Secure Title | SOPORTE API" },
    ];
    expect(proyectoQueNombraElTitulo("STL: Propuesta Smarteam", ps, stl).proyectoId).toBeNull();
    expect(proyectoQueNombraElTitulo("STL Service Hub | Tickets", ps, stl).proyectoId).toBe("service");
    const smarteam = { name: "Smarteam", company: "smarteamcr.com", siglas: [] };
    const reportes = [
      { id: "reportes", name: "Integración con Reportes web" },
      { id: "agencia", name: "Agencia | Contenido" },
    ];
    expect(proyectoQueNombraElTitulo("Sitio web Smarteam", reportes, smarteam).proyectoId).toBeNull();
    expect(proyectoQueNombraElTitulo("Reportes web | avance", reportes, smarteam).proyectoId).toBe("reportes");
  });

  it("un número suelto (un año) no es una palabra propia", () => {
    const ps = [
      { id: "plan", name: "Plan de continuidad 2026" },
      { id: "otro", name: "Kolbi | Marketing" },
    ];
    expect([...palabrasPropiasDeLosProyectos(ps, KOLBI).get("plan")!]).toEqual(["continuidad"]);
  });
});
