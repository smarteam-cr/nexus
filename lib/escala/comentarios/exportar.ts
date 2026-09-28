/**
 * lib/escala/comentarios/exportar.ts — los cambios pendientes con las columnas del manual. PURO.
 *
 * La tabla «Cambios pendientes» de `manual_operacion_escala.md` tiene cinco columnas: Fecha · Qué
 * cambiaría · Quién lo propone · Caso que lo originó · Qué decisión cambiaría. La exportación sale
 * con esas cinco, en Markdown (para pegar en el manual o en el chat de la escala) y en CSV.
 *
 * Las columnas se leen del ENCABEZADO de esa tabla en el manual publicado, si se puede: si el
 * manual las renombra, la exportación las sigue. Si no se encuentra la tabla, van las de hoy.
 */
import type { ComentarioVisto } from "./reglas";

export const COLUMNAS_DEL_MANUAL_DE_HOY = [
  "Fecha",
  "Qué cambiaría",
  "Quién lo propone",
  "Caso que lo originó",
  "Qué decisión cambiaría",
] as const;

/** El encabezado de la tabla que sigue a «## Cambios pendientes» en el manual, o null. */
export function columnasDelManual(manual: string | null | undefined): string[] | null {
  if (!manual) return null;
  const lineas = manual.replace(/\r\n?/g, "\n").split("\n");
  const i = lineas.findIndex((l) => /^## Cambios pendientes\s*$/.test(l));
  if (i === -1) return null;
  const fila = lineas.slice(i + 1).find((l) => l.trim().startsWith("|"));
  if (!fila) return null;
  const celdas = fila.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  return celdas.length === COLUMNAS_DEL_MANUAL_DE_HOY.length && celdas.every(Boolean) ? celdas : null;
}

/** «2026-09-27» en la hora de Costa Rica (la del equipo). */
export function fechaDelManual(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function filasDelManual(comentarios: ComentarioVisto[]): string[][] {
  return comentarios
    .filter((c) => c.cambio)
    .map((c) => [fechaDelManual(c.createdAt), c.cambio!.que, c.autor.nombre, c.cambio!.caso, c.cambio!.decision]);
}

/** Una celda de tabla Markdown: sin saltos de línea y con las barras escapadas. */
function celdaMd(s: string): string {
  return s.replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
}

export function tablaMarkdown(filas: string[][], columnas: readonly string[] = COLUMNAS_DEL_MANUAL_DE_HOY): string {
  return [
    `| ${columnas.join(" | ")} |`,
    `|${columnas.map(() => ":--").join("|")}|`,
    ...filas.map((f) => `| ${f.map(celdaMd).join(" | ")} |`),
  ].join("\n");
}

function celdaCsv(s: string): string {
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con BOM, para que Excel lea bien las tildes. */
export function csv(filas: string[][], columnas: readonly string[] = COLUMNAS_DEL_MANUAL_DE_HOY): string {
  return "﻿" + [columnas, ...filas].map((f) => f.map(celdaCsv).join(",")).join("\r\n") + "\r\n";
}
