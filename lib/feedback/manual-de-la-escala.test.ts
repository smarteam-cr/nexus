/**
 * lib/feedback/manual-de-la-escala.test.ts — los cambios de la escala con las columnas del manual.
 * (Venían de lib/escala/comentarios/reglas.test.ts, retirado el 2026-10-05.)
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { columnasDelManual, COLUMNAS_DEL_MANUAL_DE_HOY, csv, fechaDelManual, filasDelManual, tablaMarkdown, type CambioDeLaEscala } from "./manual-de-la-escala";

const cambio = (extra: Partial<CambioDeLaEscala["cambio"]> = {}): CambioDeLaEscala => ({
  creado: "2026-09-28T03:00:00.000Z", // 27 de setiembre, 21:00 en Costa Rica
  autor: "Ana Pérez",
  cambio: { que: "`1.7.F1` — definirlo a tiempo", caso: "Inmobiliaria X", decision: "El nivel", ...extra },
});

describe("las filas del manual", () => {
  it("la fecha es la de Costa Rica, no la de UTC", () => {
    expect(fechaDelManual("2026-09-28T03:00:00.000Z")).toBe("2026-09-27");
  });

  it("en el orden de las columnas: fecha, qué, quién, caso y decisión", () => {
    expect(filasDelManual([cambio()])).toEqual([["2026-09-27", "`1.7.F1` — definirlo a tiempo", "Ana Pérez", "Inmobiliaria X", "El nivel"]]);
  });

  it("Markdown con las cinco columnas del manual, sin romper la tabla", () => {
    const md = tablaMarkdown(filasDelManual([cambio({ que: "`1.7.F1` — a | b", caso: "línea 1\nlínea 2" })]));
    expect(md.split("\n")).toEqual([
      "| Fecha | Qué cambiaría | Quién lo propone | Caso que lo originó | Qué decisión cambiaría |",
      "|:--|:--|:--|:--|:--|",
      "| 2026-09-27 | `1.7.F1` — a \\| b | Ana Pérez | línea 1 línea 2 | El nivel |",
    ]);
  });

  it("CSV con BOM y comillas donde hace falta", () => {
    const texto = csv(filasDelManual([cambio({ que: 'Dice "a tiempo"', caso: "x, y", decision: "z" })]));
    expect(texto.startsWith("﻿Fecha,")).toBe(true);
    expect(texto).toContain('"Dice ""a tiempo""",Ana Pérez');
    expect(texto).toContain('"x, y"');
  });

  it("las columnas se leen del manual real (hoy son las cinco de siempre)", () => {
    expect(columnasDelManual(leerArchivoDeLaEscala("manual"))).toEqual([...COLUMNAS_DEL_MANUAL_DE_HOY]);
    expect(columnasDelManual("# sin tabla")).toBeNull();
  });
});
