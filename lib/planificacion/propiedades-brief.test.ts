/**
 * lib/planificacion/propiedades-brief.test.ts — las propiedades con lo que pide el Brief de implementación
 * (2026-10-25): grupos con orden, la ficha, la plantilla de importación, pegar una plantilla y que la IA
 * o el chat no le borren a una fila su identidad.
 */
import { describe, it, expect } from "vitest";
import {
  gruposDe,
  agregarGrupo,
  renombrarGrupo,
  moverGrupo,
  quitarGrupo,
  opcionesDe,
  fichaDe,
  plantillaDeImportacion,
  conservarLoDeFuera,
  fusionarFilas,
  type FilaPropiedad,
  type PropiedadesData,
} from "./propiedades";
import { leerPlantilla, sumarImportadas, tipoDesdeTexto } from "./importar";

const fila = (p: Partial<FilaPropiedad>): FilaPropiedad => ({ objeto: "Contacto", etiqueta: "", campo: "", tipo: "texto", ...p });

const base = (): PropiedadesData => ({
  filas: [
    fila({ id: "a", etiqueta: "Nombre", grupo: "Información del contacto", enFicha: "si", estado: "hubspot" }),
    fila({ id: "b", etiqueta: "Estado del lead", grupo: "Clasificación de registro", tipo: "desplegable", enFicha: "si" }),
    fila({ id: "c", etiqueta: "Motivo de interés", tipo: "casillas" }),
    fila({ id: "d", objeto: "Negocio", etiqueta: "Razón de pérdida", grupo: "Información del negocio" }),
  ],
});

describe("los grupos de un objeto", () => {
  it("salen en el orden de las filas, con «sin grupo» al final y sin mezclar objetos", () => {
    expect(gruposDe(base(), "Contacto")).toEqual(["Información del contacto", "Clasificación de registro", ""]);
    expect(gruposDe(base(), "Negocio")).toEqual(["Información del negocio"]);
  });

  it("un grupo nuevo sin propiedades se guarda y aparece", () => {
    const d = agregarGrupo(base(), "Contacto", "Información de gestión");
    expect(gruposDe(d, "Contacto")).toEqual(["Información del contacto", "Clasificación de registro", "Información de gestión", ""]);
    // Repetido (sin importar mayúsculas): no se suma dos veces.
    expect(agregarGrupo(d, "Contacto", "información de gestión")).toBe(d);
  });

  it("mover cambia el orden solo dentro del objeto", () => {
    const d = moverGrupo(base(), "Contacto", "Clasificación de registro", -1);
    expect(gruposDe(d, "Contacto").slice(0, 2)).toEqual(["Clasificación de registro", "Información del contacto"]);
    expect(gruposDe(d, "Negocio")).toEqual(["Información del negocio"]);
    // En el borde no se mueve.
    expect(moverGrupo(base(), "Contacto", "Información del contacto", -1)).toEqual(base());
  });

  it("renombrar cambia las filas, que pasan a ser de una persona; renombrar a uno existente los junta", () => {
    const d = renombrarGrupo(base(), "Contacto", "Información del contacto", "Datos principales");
    expect(d.filas[0]).toMatchObject({ grupo: "Datos principales", autor: "persona" });
    const juntos = renombrarGrupo(base(), "Contacto", "Información del contacto", "Clasificación de registro");
    expect(gruposDe(juntos, "Contacto")).toEqual(["Clasificación de registro", ""]);
  });

  it("quitar un grupo no borra sus propiedades: quedan sin grupo", () => {
    const d = quitarGrupo(base(), "Contacto", "Clasificación de registro");
    expect(d.filas).toHaveLength(4);
    expect(d.filas[1].grupo).toBe("");
    expect(gruposDe(d, "Contacto")).toEqual(["Información del contacto", ""]);
  });
});

describe("las opciones y la ficha", () => {
  it("las opciones se separan por renglón o «·», y por coma solo si no hay ninguno", () => {
    expect(opcionesDe("Nuevo · En contacto · Descartado")).toEqual(["Nuevo", "En contacto", "Descartado"]);
    expect(opcionesDe("Nuevo\nRe ingreso")).toEqual(["Nuevo", "Re ingreso"]);
    expect(opcionesDe("Lead, Cliente")).toEqual(["Lead", "Cliente"]);
    expect(opcionesDe("⚠️ Por definir")).toEqual([]);
  });

  it("la ficha muestra solo lo marcado, agrupado y en el orden de los grupos", () => {
    const d = moverGrupo(base(), "Contacto", "Clasificación de registro", -1);
    expect(fichaDe(d, "Contacto")).toEqual([
      { grupo: "Clasificación de registro", propiedades: ["Estado del lead"] },
      { grupo: "Información del contacto", propiedades: ["Nombre"] },
    ]);
    expect(fichaDe(base(), "Negocio")).toEqual([]);
  });
});

describe("la plantilla de importación", () => {
  it("una columna por propiedad en el orden de la ficha, sin cálculos ni nombres por validar", () => {
    const d: PropiedadesData = {
      filas: [
        ...base().filas,
        fila({ etiqueta: "Puntaje", tipo: "calculo" }),
        fila({ etiqueta: "", campo: "⚠️ Por validar" }),
        fila({ etiqueta: "Ciudad, país", grupo: "Información del contacto" }),
      ],
    };
    expect(plantillaDeImportacion(d, "Contacto")).toBe('﻿Nombre,"Ciudad, país",Estado del lead,Motivo de interés\r\n');
  });
});

describe("la IA y el chat no le borran a una fila lo que no conocen", () => {
  it("recupera id, autor, extra y la ficha por id o por nombre, y el orden de los grupos", () => {
    const previo: PropiedadesData = {
      filas: [fila({ id: "x1", autor: "persona", etiqueta: "Motivo de interés", campo: "`motivo`", enFicha: "si", extra: { Notas: "de Caroline" } })],
      grupos: [{ objeto: "Contacto", nombre: "Información de gestión" }],
    };
    const propuesta = { filas: [{ objeto: "Contacto", etiqueta: "Motivo de interés", campo: "`motivo`", tipo: "casillas" }, { objeto: "Contacto", etiqueta: "País", campo: "", tipo: "texto" }] };
    const out = conservarLoDeFuera(previo, propuesta) as PropiedadesData;
    expect(out.filas[0]).toMatchObject({ id: "x1", autor: "persona", enFicha: "si", extra: { Notas: "de Caroline" }, tipo: "casillas" });
    expect(out.filas[1].autor).toBe("ia");
    expect(out.filas[1].id).toBeTruthy();
    expect(out.grupos).toEqual(previo.grupos);
    // Una fila que el chat quitó no vuelve.
    expect((conservarLoDeFuera(previo, { filas: [] }) as PropiedadesData).filas).toEqual([]);
  });

  it("y después de eso, regenerar ya no pisa la fila de la persona", () => {
    const previo: PropiedadesData = { filas: [fila({ id: "x1", autor: "persona", etiqueta: "Motivo de interés", tipo: "casillas" })] };
    const tras = conservarLoDeFuera(previo, { filas: [{ objeto: "Contacto", etiqueta: "Motivo de interés", campo: "", tipo: "texto" }] }) as PropiedadesData;
    const regenerado = fusionarFilas(tras.filas, [fila({ etiqueta: "Motivo de interés", tipo: "numero" })]);
    expect(regenerado).toHaveLength(1);
    expect(regenerado[0]).toMatchObject({ autor: "persona", tipo: "texto" });
  });
});

describe("pegar una plantilla", () => {
  it("lee la pestaña de propiedades del Brief: grupos arriba, una propiedad por columna, opciones debajo", () => {
    // Las filas tal como se copian de «PROPIEDADES DE CONTACTO» del Brief (columnas A a S).
    const fila = (cols: Record<number, string>) => Array.from({ length: 19 }, (_, j) => cols[j] ?? "").join("\t");
    const texto = [
      fila({ 4: "TARJETA DE VISUALIZACIÓN", 6: "INFORMACIÓN DEL CONTACTO", 9: "CLASIFICACIÓN DE REGISTRO", 13: "DATOS PRINCIPALES", 18: "INFORMACIÓN DE GESTIÓN" }),
      fila({ 4: "TIPO DE PROPIEDAD", 6: "N/A", 7: "N/A", 8: "N/A", 9: "N/A", 10: "N/A", 18: "Selección múltiple" }),
      fila({ 4: "NOMBRE DE PROPIEDAD", 6: "Nombre", 7: "Apellido", 8: "Correo", 9: "Estado del lead", 10: "Etapa del ciclo de vida", 13: "Número de teléfono", 18: "Motivo de interés" }),
      fila({ 4: "CONTENIDO DE LA PROPIEDAD", 9: "Nuevo", 10: "Lead" }),
      fila({ 9: "En contacto", 10: "Lead calificado por marketing" }),
      fila({ 9: "Descartado" }),
    ].join("\n");
    const r = leerPlantilla(texto, "Contacto");
    expect(r.forma).toBe("brief");
    expect(r.filas.map((f) => f.etiqueta)).toEqual(["Nombre", "Apellido", "Correo", "Estado del lead", "Etapa del ciclo de vida", "Número de teléfono", "Motivo de interés"]);
    expect(r.filas[0]).toMatchObject({ grupo: "INFORMACIÓN DEL CONTACTO", estado: "hubspot", autor: "plantilla", objeto: "Contacto" });
    expect(r.filas[3]).toMatchObject({ grupo: "CLASIFICACIÓN DE REGISTRO", opciones: "Nuevo · En contacto · Descartado" });
    expect(r.filas[5]).toMatchObject({ grupo: "DATOS PRINCIPALES", estado: "nueva" });
    expect(r.filas[6]).toMatchObject({ grupo: "INFORMACIÓN DE GESTIÓN", tipo: "casillas" });
  });

  it("lee una tabla vertical, con las columnas que no conoce en `extra`", () => {
    const texto = [
      "Objeto\tPropiedad\tNombre interno\tTipo\tOpciones\tObligatoria\tResponsable",
      "Negocio\tRazón de pérdida\trazon_perdida\tSelección desplegable\tPrecio, Tiempo\tSí\tCaroline",
      "\t\t\t\t\t\t",
      "\tCanal de ingreso\t\tTexto de una línea\t\tno\t",
    ].join("\n");
    const r = leerPlantilla(texto, "Contacto");
    expect(r.forma).toBe("vertical");
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0]).toMatchObject({ objeto: "Negocio", etiqueta: "Razón de pérdida", campo: "razon_perdida", tipo: "desplegable", obligatoria: "si", extra: { Responsable: "Caroline" } });
    expect(r.filas[1]).toMatchObject({ objeto: "Contacto", tipo: "texto", obligatoria: "no" });
  });

  it("lo que no se reconoce no inventa filas", () => {
    expect(leerPlantilla("hola\tmundo\n1\t2", "Contacto")).toEqual({ filas: [], forma: null });
  });

  it("los tipos en español o en inglés", () => {
    expect(tipoDesdeTexto("Opción desplegable")).toBe("desplegable");
    expect(tipoDesdeTexto("Multiple checkboxes")).toBe("casillas");
    expect(tipoDesdeTexto("Fecha y hora")).toBe("fecha_hora");
    expect(tipoDesdeTexto("Texto de varias líneas")).toBe("texto_largo");
    expect(tipoDesdeTexto("N/A")).toBe("");
  });

  it("sumar respeta lo de una persona, reemplaza lo de la IA y suma los grupos", () => {
    const data: PropiedadesData = {
      filas: [fila({ id: "p", autor: "persona", etiqueta: "Nombre" }), fila({ id: "i", autor: "ia", etiqueta: "Correo" })],
    };
    const importadas = [fila({ autor: "plantilla", etiqueta: "Nombre", grupo: "Info" }), fila({ autor: "plantilla", etiqueta: "Correo", grupo: "Info" }), fila({ autor: "plantilla", etiqueta: "País", grupo: "Dirección" })];
    const r = sumarImportadas(data, importadas);
    expect(r).toMatchObject({ sumadas: 2, repetidas: 1 });
    expect(r.data.filas.map((f) => `${f.etiqueta}:${f.autor}`)).toEqual(["Nombre:persona", "Correo:plantilla", "País:plantilla"]);
    expect(r.data.filas[1].id).toBe("i");
    expect(gruposDe(r.data, "Contacto")).toEqual(["Info", "Dirección", ""]);
  });
});
