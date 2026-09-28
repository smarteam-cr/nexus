/**
 * lib/escala/comentarios/reglas.test.ts — quién hace qué con un comentario, y la fila del manual.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { columnasDelManual, COLUMNAS_DEL_MANUAL_DE_HOY, csv, fechaDelManual, filasDelManual, tablaMarkdown } from "./exportar";
import {
  esResponsable,
  filaSugerida,
  puedeBorrarComentario,
  puedeBorrarRespuesta,
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

  it("después es evidencia: solo el responsable lo borra", () => {
    const respondido = { autorEmail: CSE, estado: "respondido", respuestas: 1 };
    expect(puedeBorrarComentario(respondido, CSE)).toBe(false);
    expect(puedeBorrarComentario(respondido, ELIAS)).toBe(true);
    expect(puedeBorrarComentario(abiertoSinRespuestas, CSE)).toBe(true);
  });

  it("una respuesta la borra su autor o el responsable", () => {
    expect(puedeBorrarRespuesta(CSE, CSE)).toBe(true);
    expect(puedeBorrarRespuesta(CSE, ELIAS)).toBe(true);
    expect(puedeBorrarRespuesta(CSE, "otro@smarteamcr.com")).toBe(false);
  });
});

const comentario = (extra: Partial<ComentarioVisto>): ComentarioVisto => ({
  id: "c1",
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
  autor: { email: CSE, nombre: "Ana Pérez", foto: null },
  estado: "abierto",
  estadoCambiado: null,
  cambio: null,
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
