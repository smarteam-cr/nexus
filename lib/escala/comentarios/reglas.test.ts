/**
 * lib/escala/comentarios/reglas.test.ts — quién hace qué con un comentario, y la fila del manual.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { columnasDelManual, COLUMNAS_DEL_MANUAL_DE_HOY, csv, fechaDelManual, filasDelManual, tablaMarkdown } from "./exportar";
import {
  esResponsable,
  etiquetaDeEstado,
  filaSugerida,
  puedeBorrarComentario,
  puedeEditarComentario,
  RESPONSABLES_DE_LA_ESCALA,
  type ComentarioVisto,
} from "./reglas";

const ELIAS = "egonzalez@smarteamcr.com";
const CSE = "cse@smarteamcr.com";

describe("el responsable", () => {
  it("es Elías, por correo (no por rol): sin distinguir mayúsculas", () => {
    expect(RESPONSABLES_DE_LA_ESCALA).toEqual([ELIAS]);
    expect(esResponsable("EGonzalez@SmarteamCR.com ")).toBe(true);
    expect(esResponsable(CSE)).toBe(false);
    expect(esResponsable(null)).toBe(false);
    expect(esResponsable("")).toBe(false);
  });
});

describe("editar y borrar", () => {
  const abiertoSinRespuestas = { autorEmail: CSE, estado: "abierto", respuestas: 0 };

  it("el autor edita lo suyo mientras está abierto y sin respuestas", () => {
    expect(puedeEditarComentario(abiertoSinRespuestas, CSE)).toBe(true);
    expect(puedeEditarComentario({ ...abiertoSinRespuestas, respuestas: 1 }, CSE)).toBe(false);
    expect(puedeEditarComentario({ ...abiertoSinRespuestas, estado: "respondido" }, CSE)).toBe(false);
    expect(puedeEditarComentario(abiertoSinRespuestas, "otro@smarteamcr.com")).toBe(false);
  });

  it("después es evidencia: solo lo borra quien revisa el feedback (cualquier super admin, 2026-10-05)", () => {
    const respondido = { autorEmail: CSE, estado: "respondido", respuestas: 1 };
    expect(puedeBorrarComentario(respondido, CSE, false)).toBe(false);
    expect(puedeBorrarComentario(respondido, "otro@smarteamcr.com", true)).toBe(true);
    // Ser el responsable de la escala ya no alcanza: decide quien revisa el feedback.
    expect(puedeBorrarComentario(respondido, ELIAS, false)).toBe(false);
    expect(puedeBorrarComentario(abiertoSinRespuestas, CSE, false)).toBe(true);
  });
});

describe("los estados se llaman como en Feedback, donde se deciden", () => {
  it("sin revisar, respondido, en la hoja de ruta y no se hará", () => {
    expect(["abierto", "respondido", "cambio_pendiente", "descartado"].map(etiquetaDeEstado)).toEqual([
      "Sin revisar",
      "Respondido",
      "En la hoja de ruta",
      "No se hará",
    ]);
  });
});

const comentario = (extra: Partial<ComentarioVisto>): ComentarioVisto => ({
  id: "c1",
  numero: 12,
  ancla: "1.7.F1",
  tipoDeAncla: "criterio",
  area: "1",
  dimension: "1.7",
  versionEscala: "7.0.0",
  textoAnclado: "Texto",
  tipo: "no_calza",
  cuerpo: "Su ciclo dura nueve meses.",
  decisionQueCambiaria: null,
  cliente: { id: "cl1", nombre: "Inmobiliaria X" },
  perfil: { cierre: "con equipo", despues: "única" },
  edicion: null,
  textoDeHoy: "Texto",
  ruta: "Ventas · Tracción del Deal · Funcional",
  autor: { email: CSE, nombre: "Ana Pérez", foto: null },
  estado: "abierto",
  estadoCambiado: null,
  cambio: null,
  tema: null,
  motivoDescarte: null,
  createdAt: "2026-09-28T03:00:00.000Z", // 27 de setiembre, 21:00 en Costa Rica
  editadoAt: null,
  respuestas: [],
  ...extra,
});

describe("la fila del manual", () => {
  it("se sugiere desde el comentario: el caso sale del cliente y de lo que pasó", () => {
    expect(filaSugerida(comentario({}))).toEqual({
      que: "`1.7.F1` — ",
      caso: "Inmobiliaria X: Su ciclo dura nueve meses.",
      decision: "",
    });
    expect(filaSugerida(comentario({ tipo: "propuesta", cliente: null, cuerpo: "Definir a tiempo.", decisionQueCambiaria: "El nivel." }))).toEqual({
      que: "`1.7.F1` — Definir a tiempo.",
      caso: "",
      decision: "El nivel.",
    });
  });

  it("si se comentó desde una edición, la fila dice de cuál (las columnas del manual son fijas)", () => {
    const desdeLaEdicion = comentario({ tipo: "propuesta", cliente: null, cuerpo: "Medirlo por producto.", edicion: { slug: "ecommerce-retail", nombre: "Ecommerce y retail" } });
    expect(filaSugerida(desdeLaEdicion).que).toBe("`1.7.F1` (edición Ecommerce y retail) — Medirlo por producto.");
  });

  it("la fecha es la de Costa Rica, no la de UTC", () => {
    expect(fechaDelManual("2026-09-28T03:00:00.000Z")).toBe("2026-09-27");
  });

  it("Markdown con las cinco columnas del manual, sin romper la tabla", () => {
    const c = comentario({ estado: "cambio_pendiente", cambio: { que: "`1.7.F1` — a | b", caso: "línea 1\nlínea 2", decision: "El nivel" } });
    const md = tablaMarkdown(filasDelManual([c, comentario({})]));
    expect(md.split("\n")).toEqual([
      "| Fecha | Qué cambiaría | Quién lo propone | Caso que lo originó | Qué decisión cambiaría |",
      "|:--|:--|:--|:--|:--|",
      "| 2026-09-27 | `1.7.F1` — a \\| b | Ana Pérez | línea 1 línea 2 | El nivel |",
    ]);
  });

  it("CSV con BOM y comillas donde hace falta", () => {
    const c = comentario({ estado: "cambio_pendiente", cambio: { que: 'Dice "a tiempo"', caso: "x, y", decision: "z" } });
    const texto = csv(filasDelManual([c]));
    expect(texto.startsWith("﻿Fecha,")).toBe(true);
    expect(texto).toContain('"Dice ""a tiempo""",Ana Pérez');
    expect(texto).toContain('"x, y"');
  });

  it("las columnas se leen del manual real (hoy son las cinco de siempre)", () => {
    expect(columnasDelManual(leerArchivoDeLaEscala("manual"))).toEqual([...COLUMNAS_DEL_MANUAL_DE_HOY]);
    expect(columnasDelManual("# sin tabla")).toBeNull();
  });
});
