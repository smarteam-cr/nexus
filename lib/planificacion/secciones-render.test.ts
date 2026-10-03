/**
 * lib/planificacion/secciones-render.test.ts — las secciones de la Planificación práctica se pintan,
 * con la forma nueva y con lo viejo, en lectura, en edición y en el PDF (2026-10-02).
 *
 * El navegador del preview no está logueado: esto es lo que se puede comprobar sin la pantalla.
 */
import { describe, expect, it } from "vitest";
import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ProcesosFuturoSection,
  CicloDeVidaSection,
  PropiedadesObjetoSection,
  PipelinesSection,
  AutomatizacionesSection,
  ConversacionesSection,
} from "@/components/landing/sections-planificacion";
import type { LandingContext } from "@/components/landing/types";

const ctx = (pdfMode = false) => ({ clientName: "FUNDAUNA", pdfMode }) as unknown as LandingContext;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function html(C: FC<any>, data: unknown, opts: { editable?: boolean; pdf?: boolean } = {}): string {
  return renderToStaticMarkup(createElement(C, { data, ctx: ctx(opts.pdf), editable: opts.editable, onChange: () => {} }));
}

describe("procesos: solo lo que se hará", () => {
  it("pinta los pasos en orden con su origen, y nunca el «hoy»", () => {
    const out = html(ProcesosFuturoSection, {
      procesos: [{ nombre: "Captación", resumen: "Todo lead entra a HubSpot", comoEsHoy: "SECRETO-DE-HOY", pasos: [{ paso: "Llena un formulario", origen: "acordado" }, { paso: "Se califica", origen: "supuesto" }] }],
    });
    expect(out).toContain("Llena un formulario");
    expect(out).toContain("stl-origen--acordado");
    expect(out).toContain("stl-origen--supuesto");
    expect(out).not.toContain("SECRETO-DE-HOY");
  });

  it("lo viejo sin pasos muestra el párrafo «cómo será»", () => {
    expect(html(ProcesosFuturoSection, { procesos: [{ nombre: "Ventas", comoSera: "Un pipeline visible", comoEsHoy: "x" }] })).toContain("Un pipeline visible");
  });

  it("vacía en lectura no pinta nada; en edición ofrece agregar", () => {
    expect(html(ProcesosFuturoSection, { procesos: [] })).toBe("");
    expect(html(ProcesosFuturoSection, { procesos: [] }, { editable: true })).toContain("Agregar proceso");
  });
});

describe("ciclo de vida", () => {
  it("la prosa vieja se lee como tabla", () => {
    const out = html(CicloDeVidaSection, { items: [{ title: "Lead", detail: "Llena un formulario" }] });
    expect(out).toContain("<table");
    expect(out).toContain("Lead");
    expect(out).toContain("Llena un formulario");
  });
});

describe("propiedades por objeto", () => {
  const data = {
    filas: [
      { objeto: "Contacto", etiqueta: "Proyecto", campo: "proyecto", tipo: "desplegable", origen: "acordado" },
      { objeto: "Ticket", etiqueta: "Categoría", campo: "categoria_ticket", tipo: "desplegable" },
    ],
  };
  it("en pantalla, una pestaña por objeto y la tabla del primero", () => {
    const out = html(PropiedadesObjetoSection, data);
    expect(out).toContain('role="tab"');
    expect(out).toContain("Proyecto");
    expect(out).not.toContain("categoria_ticket");
  });
  it("en el PDF no hay pestañas: salen todos los objetos", () => {
    const out = html(PropiedadesObjetoSection, data, { pdf: true });
    expect(out).not.toContain('role="tab"');
    expect(out).toContain("proyecto");
    expect(out).toContain("categoria_ticket");
  });
  it("en edición aparecen las pestañas de los objetos estándar aunque estén vacías", () => {
    expect(html(PropiedadesObjetoSection, data, { editable: true })).toContain("Empresa");
  });
});

describe("pipelines", () => {
  it("las etapas van en una fila, con lo que se pide para avanzar", () => {
    const out = html(PipelinesSection, {
      pipelines: [{ tipo: "leads", nombre: "Calificación de leads", etapas: [{ etapa: "Nuevo", requisitos: "Proyecto, Canal" }, { etapa: "Descalificado", cierre: "perdido" }] }],
    });
    expect(out).toContain("stl-plan-etapas");
    expect(out).toContain("Leads");
    expect(out).toContain("<span>Canal</span>");
    expect(out).toContain("stl-plan-etapa--perdido");
  });
  it("los que vinieron de Ejecución se ven con su texto", () => {
    expect(html(PipelinesSection, { procesos: [{ nombre: "Pipeline de ventas", comoSera: "Nuevo → Ganado" }] })).toContain("Nuevo → Ganado");
  });
});

describe("automatizaciones y conversaciones", () => {
  it("los procesos de marketing viejos se leen como automatizaciones; lo que falta, marcado", () => {
    const out = html(AutomatizacionesSection, { items: [{ title: "Scoring", detail: "Suma puntos" }, { nombre: "Seguimiento", falta: "Cada cuánto" }] });
    expect(out).toContain("Scoring");
    expect(out).toContain("Suma puntos");
    expect(out).toContain("stl-plan-falta");
  });
  it("conversaciones dice quién responde", () => {
    const out = html(ConversacionesSection, { items: [{ nombre: "Agente de IA en WhatsApp", responde: "agente_ia" }] });
    expect(out).toContain("Agente de IA en WhatsApp");
    expect(out).toContain("Agente de IA");
  });
});
