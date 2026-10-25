/**
 * lib/planificacion/brief.test.ts — lo que la Planificación trajo del Brief de implementación (2026-10-25):
 * los permisos no se contradicen, los avisos de los usuarios, los formularios contra la tabla de
 * propiedades, y que las secciones nuevas se pinten en lectura, en edición y en el PDF.
 */
import { describe, it, expect } from "vitest";
import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ajustarPermiso,
  nivelesPermitidos,
  avisosDeUsuarios,
  resumenDeLicencias,
  adoptarFichaDelProyecto,
  camposContraPropiedades,
  propiedadesParaFormulario,
  conIds,
} from "./brief";
import type { FilaPropiedad } from "./propiedades";
import {
  FichaDelProyectoSection,
  UsuariosPermisosSection,
  CanalesDeEntradaSection,
  FormulariosSection,
  CotizacionesSection,
  InformesSection,
} from "@/components/landing/sections-planificacion-brief";
import { CicloDeVidaSection, PropiedadesObjetoSection, ConversacionesSection, AutomatizacionesSection } from "@/components/landing/sections-planificacion";
import type { LandingContext } from "@/components/landing/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function html(C: FC<any>, data: unknown, opts: { editable?: boolean; pdf?: boolean; ctx?: Partial<LandingContext> } = {}): string {
  const ctx = { clientName: "Wherex", pdfMode: opts.pdf, ...opts.ctx } as LandingContext;
  return renderToStaticMarkup(createElement(C, { data, ctx, editable: opts.editable, onChange: () => {} }));
}

describe("los permisos no se contradicen", () => {
  it("editar no llega más lejos que ver, ni eliminar más que editar", () => {
    expect(ajustarPermiso({ ver: "propios" }, "editar", "todo")).toEqual({ ver: "propios", editar: "propios" });
    expect(ajustarPermiso({ ver: "todo", editar: "equipo" }, "eliminar", "todo")).toMatchObject({ eliminar: "equipo" });
  });

  it("bajar ver baja lo que depende de él", () => {
    expect(ajustarPermiso({ ver: "todo", editar: "todo", eliminar: "equipo" }, "ver", "propios")).toEqual({ ver: "propios", editar: "propios", eliminar: "propios" });
    expect(ajustarPermiso({ ver: "todo", editar: "todo", eliminar: "todo" }, "ver", "nada")).toEqual({ ver: "nada", editar: "nada", eliminar: "nada" });
  });

  it("el desplegable solo ofrece lo que se puede", () => {
    expect(nivelesPermitidos({ ver: "equipo" }, "editar").map((n) => n.value)).toEqual(["nada", "propios", "equipo"]);
    expect(nivelesPermitidos(undefined, "ver")).toHaveLength(4);
    expect(nivelesPermitidos(undefined, "editar").map((n) => n.value)).toEqual(["nada"]);
  });
});

describe("los usuarios", () => {
  const d = {
    equipos: [{ id: "e1", nombre: "Ventas" }],
    usuarios: [
      { id: "u1", nombre: "Lorena", correo: "lorena@x.com", equipoId: "e1", licencia: "Sales Hub Pro" },
      { id: "u2", nombre: "Pedro", correo: "LORENA@x.com", licencia: "Sales Hub Pro" },
      { id: "u3", nombre: "Ana" },
      { id: "u4", nombre: "" },
    ],
  };

  it("avisan sin correo, correo repetido, sin superadministrador y sin equipo", () => {
    expect(avisosDeUsuarios(d)).toEqual([
      "Un usuario no tiene correo: sin correo no se le puede invitar.",
      "Correo repetido: lorena@x.com.",
      "Nadie quedó como superadministrador.",
      "2 usuarios no tienen equipo: no se sabe qué permisos le tocan.",
    ]);
    expect(avisosDeUsuarios({ equipos: [], usuarios: [] })).toEqual([]);
  });

  it("cuentan las licencias que hacen falta, sin contar las filas vacías", () => {
    expect(resumenDeLicencias(d.usuarios)).toEqual([
      { licencia: "Sales Hub Pro", usuarios: 2 },
      { licencia: "Sin licencia definida", usuarios: 1 },
    ]);
  });

  it("los ids se ponen al escribir y no cambian los que ya hay", () => {
    const out = conIds([{ id: "a" }, {}]);
    expect(out[0].id).toBe("a");
    expect(out[1].id).toBeTruthy();
  });
});

describe("la ficha del proyecto", () => {
  it("los cinco hubs del Brief siempre están, con lo guardado en su lugar", () => {
    const f = adoptarFichaDelProyecto({ hubs: [{ hub: "ventas", incluido: "si", edicion: "professional" }] });
    expect(f.hubs.map((h) => h.hub)).toEqual(["Marketing", "ventas", "Servicio", "Operaciones", "Contenido"]);
    expect(f.hubs[1].edicion).toBe("professional");
  });

  it("en lectura solo se ven los hubs que entran; vacía no pinta nada", () => {
    const out = html(FichaDelProyectoSection, { hubs: [{ hub: "Ventas", incluido: "si", edicion: "professional", sesionesSetup: "3" }] });
    expect(out).toContain("Ventas");
    expect(out).toContain("Professional");
    expect(out).not.toContain("Marketing");
    expect(html(FichaDelProyectoSection, {})).toBe("");
    expect(html(FichaDelProyectoSection, {}, { editable: true })).toContain("Empezar con los cargos de siempre");
  });
});

describe("los formularios contra la tabla de propiedades", () => {
  const propiedades: FilaPropiedad[] = [
    { id: "p1", objeto: "Contacto", etiqueta: "Nombre completo", campo: "", tipo: "texto" },
    { id: "p2", objeto: "Negocio", etiqueta: "Valor", campo: "", tipo: "moneda" },
  ];

  it("manda el nombre de la tabla, y avisa si la propiedad ya no está", () => {
    const campos = camposContraPropiedades(
      [{ propiedadId: "p1", etiqueta: "Nombre" }, { propiedadId: "borrada", etiqueta: "País" }, { etiqueta: "Suelto" }],
      propiedades,
    );
    expect(campos.map((c) => [c.vigente, c.falta])).toEqual([["Nombre completo", false], ["País", true], ["Suelto", false]]);
    // Sin la tabla (el PDF, el enlace), lo guardado y sin avisos.
    expect(camposContraPropiedades([{ propiedadId: "borrada", etiqueta: "País" }], undefined)[0]).toMatchObject({ vigente: "País", falta: false });
  });

  it("ofrece solo las propiedades del objeto del formulario", () => {
    expect(propiedadesParaFormulario(propiedades, "Contacto")).toEqual([{ value: "p1", label: "Nombre completo" }]);
    expect(propiedadesParaFormulario(propiedades, "deals")).toEqual([{ value: "p2", label: "Valor" }]);
  });

  it("en el editor marca el campo que ya no existe", () => {
    const out = html(FormulariosSection, { items: [{ nombre: "Formulario · Sitio web", campos: [{ propiedadId: "borrada", etiqueta: "País", obligatorio: "si" }] }] }, { editable: true, ctx: { planificacion: { propiedades } } });
    expect(out).toContain("Ya no está en las propiedades");
    expect(html(FormulariosSection, { items: [{ nombre: "Formulario · Sitio web", campos: [{ etiqueta: "País", obligatorio: "si" }] }] })).toContain("Obligatorio");
  });
});

describe("las secciones nuevas se pintan y, vacías, no aparecen al cliente", () => {
  it("usuarios y permisos: la matriz con sus niveles y la cuenta de licencias", () => {
    const out = html(UsuariosPermisosSection, {
      equipos: [{ id: "e1", nombre: "Supervisores", tipo: "supervision", permisos: { contactos: { ver: "todo", editar: "equipo" } } }],
      usuarios: [{ id: "u1", nombre: "Lorena", equipoId: "e1", licencia: "Sales Hub Pro", superAdmin: "si" }],
    });
    expect(out).toContain("Supervisores");
    expect(out).toContain("Lo de su equipo");
    expect(out).toContain("1 usuario · 1 Sales Hub Pro");
    expect(html(UsuariosPermisosSection, {})).toBe("");
  });

  it("canales, cotizaciones e informes", () => {
    expect(html(CanalesDeEntradaSection, { canales: [{ canal: "WhatsApp", responsable: "Equipo de ventas" }] })).toContain("Equipo de ventas");
    expect(html(CanalesDeEntradaSection, {}, { editable: true })).toContain("Empezar con los canales de siempre");
    expect(html(CotizacionesSection, { formato: "Con logo y términos" })).toContain("Con logo y términos");
    expect(html(CotizacionesSection, {})).toBe("");
    expect(html(InformesSection, { items: [{ nombre: "Negocios en el pipeline", objetivo: "OBJ-01" }] }, { pdf: true })).toContain("OBJ-01");
    expect(html(InformesSection, {})).toBe("");
  });

  it("el estado del lead va al lado del ciclo de vida", () => {
    const out = html(CicloDeVidaSection, { etapas: [], estadosLead: [{ estado: "Re ingreso", significa: "Volvió a llenar un formulario" }] });
    expect(out).toContain("Estado del lead");
    expect(out).toContain("Volvió a llenar un formulario");
  });

  it("las propiedades se ven por grupo, con la ficha armada", () => {
    const out = html(PropiedadesObjetoSection, {
      filas: [
        { objeto: "Contacto", etiqueta: "Estado del lead", grupo: "Clasificación de registro", tipo: "desplegable", opciones: "Nuevo · En contacto", enFicha: "si" },
      ],
    });
    expect(out).toContain("Clasificación de registro");
    expect(out).toContain("Así va a quedar la ficha de Contacto en HubSpot");
    expect(out).toContain("<span>En contacto</span>");
  });

  it("el guion del bot y las ramas de una automatización", () => {
    expect(html(ConversacionesSection, { items: [{ nombre: "Chatbot del sitio", responde: "chatbot", guion: ["Hola, soy el asistente", "¿Qué te interesa?"] }] })).toContain("Paso 1");
    const out = html(AutomatizacionesSection, { items: [{ nombre: "Asignar el lead", condicion: "Contacto con propietario", siCumple: "Estado «Re ingreso»", noCumple: "Estado «Nuevo»" }] });
    expect(out).toContain("Se cumple");
    expect(out).toContain("Estado «Nuevo»");
  });
});
