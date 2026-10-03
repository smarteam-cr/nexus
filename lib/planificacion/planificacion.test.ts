/**
 * lib/planificacion/planificacion.test.ts — la Planificación práctica (2026-10-02): de dónde sale cada
 * cosa, que regenerar no borre lo que escribió una persona, y que lo viejo se siga leyendo.
 */
import { describe, it, expect } from "vitest";
import { normalizarOrigen, etiquetaDeOrigen } from "./origen";
import {
  fusionarFilas,
  desdeTablaDeIntegracion,
  normalizarObjeto,
  objetosDe,
  tipoDesdeTablaDeIntegracion,
  type FilaPropiedad,
} from "./propiedades";
import {
  adoptarProcesos,
  adoptarCicloDeVida,
  adoptarPipelines,
  adoptarAutomatizaciones,
  inferirTipoDePipeline,
  listaDeRequisitos,
  mover,
} from "./secciones";

const fila = (p: Partial<FilaPropiedad>): FilaPropiedad => ({ objeto: "Contacto", etiqueta: "", campo: "", tipo: "texto", ...p });

describe("el origen", () => {
  it("lleva las variantes del agente al vocabulario, y lo desconocido queda sin chip", () => {
    expect(normalizarOrigen("Acordado")).toBe("acordado");
    expect(normalizarOrigen("acordada")).toBe("acordado");
    expect(normalizarOrigen("Inferido")).toBe("supuesto");
    expect(normalizarOrigen("propuesto")).toBe("propuesta");
    expect(normalizarOrigen("nota interna")).toBe("");
    expect(normalizarOrigen(undefined)).toBe("");
    expect(etiquetaDeOrigen("supuesto")).toBe("Supuesto");
  });
});

describe("propiedades: regenerar no borra lo de una persona", () => {
  it("las filas de una persona o de una plantilla quedan; las del agente se reemplazan", () => {
    const previas = [
      fila({ id: "a", autor: "persona", campo: "proyecto", etiqueta: "Proyecto" }),
      fila({ id: "b", autor: "ia", campo: "vieja_del_agente", etiqueta: "Vieja" }),
      fila({ id: "c", autor: "plantilla", objeto: "Ticket", campo: "categoria", extra: { "Columna de Caroline": "x" } }),
    ];
    const nuevas = [fila({ campo: "nueva", etiqueta: "Nueva" })];
    const out = fusionarFilas(previas, nuevas);
    expect(out.map((f) => f.campo)).toEqual(["proyecto", "nueva", "categoria"]);
    expect(out.find((f) => f.campo === "categoria")?.extra).toEqual({ "Columna de Caroline": "x" });
    expect(out.find((f) => f.campo === "nueva")?.autor).toBe("ia");
    expect(out.find((f) => f.campo === "nueva")?.id).toBeTruthy();
  });

  it("una nueva que repite una propiedad de una persona se descarta: manda la persona", () => {
    const previas = [fila({ id: "a", autor: "persona", campo: "`proyecto`", uso: "lo escribió Caroline" })];
    const out = fusionarFilas(previas, [fila({ campo: "proyecto", uso: "lo escribió el agente" })]);
    expect(out).toHaveLength(1);
    expect(out[0].uso).toBe("lo escribió Caroline");
  });

  it("una nueva del agente que coincide con una vieja del agente conserva su id", () => {
    const out = fusionarFilas([fila({ id: "p1", autor: "ia", campo: "tipo_programa" })], [fila({ campo: "tipo_programa", uso: "otra redacción" })]);
    expect(out[0].id).toBe("p1");
    expect(out[0].uso).toBe("otra redacción");
  });

  it("agrupa por objeto en el orden de las pestañas", () => {
    const out = fusionarFilas([], [fila({ objeto: "Ticket", campo: "t" }), fila({ objeto: "deals", campo: "n" }), fila({ objeto: "Contactos", campo: "c" })]);
    expect(out.map((f) => f.objeto)).toEqual(["Contacto", "Negocio", "Ticket"]);
  });
});

describe("propiedades: lo que vino de Ejecución", () => {
  it("la tabla de la integración pasa con el tipo de HubSpot y sin perder la descripción", () => {
    const out = desdeTablaDeIntegracion(
      [
        { sistema: "HubSpot", objeto: "Negocio", campo: "`tipo_programa`", tipo: "enumeracion", obligatorio: "si", descripcion: "Decide el pipeline" },
        { sistema: "SAP", objeto: "Contacto", campo: "id_sap", tipo: "id", esLlave: "si", descripcion: "Une con SAP" },
        { sistema: "HubSpot", objeto: "Contacto", campo: "", descripcion: "" },
      ],
      "ia",
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ objeto: "Negocio", tipo: "desplegable", obligatoria: "si", uso: "Decide el pipeline", autor: "ia" });
    expect(out[0].sistema).toBeUndefined();
    expect(out[1]).toMatchObject({ tipo: "texto", sistema: "SAP", esLlave: "si" });
  });

  it("normaliza objetos y tipos viejos", () => {
    expect(normalizarObjeto("companies")).toBe("Empresa");
    expect(normalizarObjeto("Admisiones")).toBe("Admisiones");
    expect(tipoDesdeTablaDeIntegracion("booleano")).toBe("casilla");
    expect(objetosDe([], true)).toEqual(["Contacto", "Empresa", "Lead", "Negocio", "Ticket"]);
    expect(objetosDe([fila({ objeto: "Admisiones" }), fila({ objeto: "Ticket" })])).toEqual(["Ticket", "Admisiones"]);
  });
});

describe("lo viejo se sigue leyendo", () => {
  it("procesos: del «hoy / cómo será» queda solo lo que se hará (lo de hoy se guarda, no se muestra)", () => {
    const d = adoptarProcesos({ procesos: [{ nombre: "Ventas", resumenHoy: "Hoy", comoEsHoy: "x", resumenSera: "Un pipeline", comoSera: "Párrafo" }] });
    expect(d.procesos[0]).toMatchObject({ nombre: "Ventas", resumen: "Un pipeline", comoSera: "Párrafo", pasos: [] });
  });

  it("ciclo de vida: la prosa pasa a tabla; si ya hay tabla, manda la tabla", () => {
    expect(adoptarCicloDeVida({ intro: "i", items: [{ title: "Lead", detail: "Llena un formulario" }] }).etapas).toEqual([
      { etapa: "Lead", entraCuando: "Llena un formulario", laMueve: "", cambio: "", origen: "" },
    ]);
    const conTabla = adoptarCicloDeVida({ etapas: [{ etapa: "MQL", entraCuando: "x" }], items: [{ title: "vieja" }] });
    expect(conTabla.etapas.map((e) => e.etapa)).toEqual(["MQL"]);
  });

  it("pipelines de Ejecución: el texto de las etapas queda como nota (no se adivina dónde termina cada una)", () => {
    const d = adoptarPipelines({ procesos: [{ nombre: "Pipeline de ventas — Negocios", comoEsHoy: "No existe", comoSera: "Nuevo → Calificado → Ganado", sistemas: "Negocios" }] });
    expect(d.pipelines).toEqual([
      { tipo: "ventas", nombre: "Pipeline de ventas — Negocios", objeto: "Negocios", nota: "Nuevo → Calificado → Ganado", origen: "", etapas: [] },
    ]);
  });

  it("procesos de marketing de Ejecución → automatizaciones", () => {
    const d = adoptarAutomatizaciones({ items: [{ title: "Scoring de leads", detail: "Suma puntos por descarga" }] });
    expect(d.items[0]).toMatchObject({ nombre: "Scoring de leads", hace: "Suma puntos por descarga" });
  });

  it("infiere el tipo de pipeline por sus palabras", () => {
    expect(inferirTipoDePipeline("Mesa de ayuda", "Ticket")).toBe("servicio");
    expect(inferirTipoDePipeline("Calificación de leads")).toBe("leads");
    expect(inferirTipoDePipeline("Admisión de posgrados")).toBe("ventas");
    expect(inferirTipoDePipeline("Onboarding")).toBe("otro");
  });
});

describe("utilidades de los renderers", () => {
  it("requisitos separados por comas y mover dentro de rango", () => {
    expect(listaDeRequisitos("Proyecto, Tipo de programa ;  ")).toEqual(["Proyecto", "Tipo de programa"]);
    expect(mover(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(mover(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});
