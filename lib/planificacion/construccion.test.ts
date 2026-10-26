/**
 * lib/planificacion/construccion.test.ts — la lista de construcción (L4 etapa 5, 2026-10-27).
 */
import { describe, it, expect } from "vitest";
import {
  CLAVE_DE_CONSTRUCCION,
  avanceDeConstruccion,
  conMarca,
  cosasParaConstruir,
  enlaceValido,
  gruposDeConstruccion,
  marcasDe,
  notasDelGrupo,
  origenIdDelGrupo,
} from "./construccion";
import { preserveNonSchemaKeys } from "@/lib/ai/section-schema";
import { PLANIFICACION_DEF_BY_KEY } from "@/components/landing/configs/planificacion.defs";

const AHORA = "2026-10-27T15:00:00.000Z";

const secciones = [
  {
    key: "propiedades",
    data: {
      filas: [
        { id: "p1", objeto: "Contacto", etiqueta: "Motivo de interés", campo: "motivo", tipo: "desplegable", estado: "nueva" },
        { id: "p2", objeto: "Contacto", etiqueta: "Correo", campo: "email", tipo: "texto", estado: "hubspot" },
        { id: "p3", objeto: "Negocio", etiqueta: "Programa", campo: "programa", tipo: "texto", estado: "ajustar" },
        { id: "p4", objeto: "Contacto", etiqueta: "País", campo: "pais", tipo: "texto", estado: "existente" },
      ],
    },
  },
  { key: "pipelines", data: { pipelines: [{ tipo: "ventas", nombre: "Admisión", etapas: [{ etapa: "Nuevo" }, { etapa: "Ganado" }] }] } },
  { key: "automatizaciones", data: { items: [{ nombre: "Asignar el lead", donde: "Contacto · Marketing Hub" }, { nombre: "" }] } },
  {
    key: "usuarios_permisos",
    data: { equipos: [{ id: "e1", nombre: "Ventas" }], usuarios: [{ id: "u1", nombre: "Ana", correo: "ana@x.com", licencia: "Sales Hub Pro" }, { id: "u2", nombre: "" }] },
  },
  { key: "formularios", data: { items: [{ id: "f1", nombre: "Contacto del sitio", campos: [{ etiqueta: "Correo" }] }] } },
  { key: "ciclo_vida_crm", data: { etapas: [{ etapa: "Lead", cambio: "se_mantiene" }] } },
];

describe("la lista de construcción", () => {
  it("trae lo que se construye y deja afuera lo que ya existe o viene con HubSpot", () => {
    const cosas = cosasParaConstruir(secciones);
    expect(cosas.map((c) => `${c.tipo}:${c.nombre}`)).toEqual([
      "equipo:Ventas",
      "usuario:Ana",
      "propiedad:Motivo de interés",
      "propiedad:Programa",
      "formulario:Contacto del sitio",
      "pipeline:Admisión",
      "automatizacion:Asignar el lead",
    ]);
    // El ciclo de vida sin cambios no se construye.
    expect(cosas.some((c) => c.tipo === "ciclo")).toBe(false);
    expect(cosas.every((c) => c.estado === "por_construir" && c.enlace === "")).toBe(true);
  });

  it("agrupa como va a Tareas: las propiedades por objeto, los usuarios con sus equipos", () => {
    const grupos = gruposDeConstruccion(cosasParaConstruir(secciones));
    expect(grupos.map((g) => g.titulo)).toEqual([
      "Crea 1 equipo con sus permisos e invita a 1 usuario a HubSpot",
      "Crea 1 propiedad de Contacto en HubSpot",
      "Crea 1 propiedad de Negocio en HubSpot",
      "Arma el formulario «Contacto del sitio» en HubSpot",
      "Arma el pipeline «Admisión» en HubSpot",
      "Construye la automatización «Asignar el lead» en HubSpot",
    ]);
    const notas = notasDelGrupo(grupos[1], "Implementación CRM");
    expect(notas).toContain("Implementación CRM");
    expect(notas).toContain("- Motivo de interés (Contacto · desplegable)");
  });

  it("marcar construido guarda la fecha y el enlace en la sección, sin tocar lo demás", () => {
    const [motivo] = cosasParaConstruir(secciones).filter((c) => c.tipo === "propiedad");
    const data = conMarca(secciones[0].data, motivo.clave, { estado: "construido", enlace: "https://app.hubspot.com/x" }, AHORA);
    expect(data.filas).toBe((secciones[0].data as { filas: unknown }).filas);
    expect(marcasDe(data)[motivo.clave]).toEqual({ estado: "construido", enlace: "https://app.hubspot.com/x", en: AHORA });
    const despues = cosasParaConstruir([{ key: "propiedades", data }]);
    expect(despues.find((c) => c.clave === motivo.clave)?.estado).toBe("construido");
    expect(avanceDeConstruccion(despues)).toEqual({ total: 2, construidas: 1 });
    // Volver a «por construir» sin enlace borra la marca.
    const sinEnlace = conMarca(data, motivo.clave, { estado: "por_construir", enlace: "" }, AHORA);
    expect(marcasDe(sinEnlace)[motivo.clave]).toBeUndefined();
  });

  it("la marca sobrevive a regenerar: está fuera del esquema del agente", () => {
    const [motivo] = cosasParaConstruir(secciones).filter((c) => c.tipo === "propiedad");
    const previa = conMarca(secciones[0].data, motivo.clave, { estado: "construido" }, AHORA);
    const regenerada = preserveNonSchemaKeys(PLANIFICACION_DEF_BY_KEY.propiedades.schema, previa, { filas: [] });
    expect(regenerada[CLAVE_DE_CONSTRUCCION]).toEqual(previa[CLAVE_DE_CONSTRUCCION]);
    for (const key of ["pipelines", "automatizaciones", "usuarios_permisos", "formularios", "conversaciones", "informes", "ciclo_vida_crm"]) {
      const props = (PLANIFICACION_DEF_BY_KEY[key].schema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props), key).not.toContain(CLAVE_DE_CONSTRUCCION);
    }
  });

  it("dos ítems sin id con el mismo nombre no comparten la marca", () => {
    const cosas = cosasParaConstruir([{ key: "pipelines", data: { pipelines: [{ tipo: "ventas", nombre: "Ventas", etapas: [] }, { tipo: "ventas", nombre: "Ventas", etapas: [] }] } }]);
    expect(new Set(cosas.map((c) => c.clave)).size).toBe(2);
  });

  it("el enlace solo acepta http(s), y la clave de la tarea es estable", () => {
    expect(enlaceValido("https://app.hubspot.com/contacts/1")).toBe(true);
    expect(enlaceValido("")).toBe(true);
    expect(enlaceValido("javascript:alert(1)")).toBe(false);
    expect(enlaceValido("no es un enlace")).toBe(false);
    expect(origenIdDelGrupo("c1", "usuarios")).toBe("planificacion:c1:usuarios");
  });
});
