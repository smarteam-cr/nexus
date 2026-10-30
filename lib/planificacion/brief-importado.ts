/**
 * lib/planificacion/brief-importado.ts — EL BRIEF DE IMPLEMENTACIÓN YA LLENO, dentro de la Planificación (2026-10-29,
 * pregunta 32 del roadmap; Elías: «que se copien a la Planificación de cada uno, pero como sección no visible y
 * expandida»). Puro y client-safe: lo usan el servidor que lee la hoja, la sección que la muestra y el agente.
 *
 * La hoja «BRIEF DE IMPLEMENTACIÓN» (Google Sheets, unas 20 pestañas) es lo que el equipo llenaba a mano con cada cliente.
 * Se trae ENTERA, pestaña por pestaña, como tablas de texto: no se adivina a qué sección de la Planificación va cada
 * celda (la hoja cambió de forma con los años, y una lectura que se equivoca de columna escribe un dato falso en un
 * documento que ve el cliente). Para pasar las propiedades a su tabla ya existe pegar la pestaña
 * (lib/planificacion/importar.ts).
 *
 * ── LAS REGLAS ───────────────────────────────────────────────────────────────
 *  · Es del EQUIPO: la sección es SOLO INTERNA (`SECCIONES_SOLO_INTERNAS`, lib/business-cases/section-briefs.ts): nunca
 *    va al enlace del cliente ni al PDF, no se puede mostrar, y en el editor arranca abierta.
 *  · Tiene tope: pestañas, filas, columnas y largo de celda (una hoja con miles de filas vacías con formato no puede
 *    inflar el documento). Las filas y columnas vacías del final se recortan; si se cortó algo, la pestaña lo dice.
 *  · El agente de la Planificación la lee como fuente (`briefParaElPrompt`), con su tope: lo que dice la hoja lo
 *    escribió el equipo, no es palabra del cliente.
 */

export const BRIEF_IMPORTADO_KEY = "brief_importado";

export const TOPE_DE_PESTANAS = 40;
export const TOPE_DE_FILAS = 300;
export const TOPE_DE_COLUMNAS = 30;
export const TOPE_DE_CELDA = 500;
/** Lo que se guarda como mucho (caracteres de celdas): el Brief entero viaja en la data y en cada foto del documento. */
export const TOPE_DEL_BRIEF = 400_000;
/** Lo que el agente lee del Brief como mucho (caracteres). */
export const TOPE_DEL_BRIEF_EN_EL_PROMPT = 40_000;

export interface PestanaDelBrief {
  nombre: string;
  filas: string[][];
  /** Si se cortaron filas o columnas por el tope. */
  recortada?: boolean;
}

export interface BriefImportado {
  /** El título de la hoja en Drive. */
  titulo: string;
  /** El enlace de la hoja (para volver a abrirla). */
  url: string;
  /** ISO: cuándo se trajo. */
  importadoEn: string;
  /** Quién la trajo (correo), o "script" si vino en el lote. */
  importadoPor: string;
  pestanas: PestanaDelBrief[];
  /** Cuántas pestañas con algo no entraron por los topes. */
  pestanasSinTraer?: number;
}

export const BRIEF_IMPORTADO_VACIO: BriefImportado = { titulo: "", url: "", importadoEn: "", importadoPor: "", pestanas: [] };

const celda = (v: unknown): string => {
  const t = typeof v === "string" ? v : v == null ? "" : String(v);
  const limpia = t.replace(/\r\n?/g, "\n").trim();
  return limpia.length <= TOPE_DE_CELDA ? limpia : `${limpia.slice(0, TOPE_DE_CELDA - 1).trimEnd()}…`;
};

/**
 * Una pestaña leída (celdas crudas) → la pestaña que se guarda: texto recortado, sin las filas y columnas vacías del
 * final, con los topes. null si quedó vacía.
 */
export function pestanaDesdeCeldas(nombre: string, crudas: readonly (readonly unknown[])[]): PestanaDelBrief | null {
  let filas = crudas.map((f) => f.map(celda));
  // Las filas vacías del final (y las del principio: la hoja suele arrancar con un margen).
  while (filas.length && filas[filas.length - 1].every((c) => c === "")) filas.pop();
  while (filas.length && filas[0].every((c) => c === "")) filas.shift();
  if (!filas.length) return null;
  let recortada = false;
  if (filas.length > TOPE_DE_FILAS) {
    filas = filas.slice(0, TOPE_DE_FILAS);
    recortada = true;
  }
  // El ancho real: la última columna con algo en alguna fila.
  let ancho = 0;
  for (const f of filas) for (let i = f.length - 1; i >= 0; i--) if (f[i] !== "") { ancho = Math.max(ancho, i + 1); break; }
  if (ancho > TOPE_DE_COLUMNAS) {
    ancho = TOPE_DE_COLUMNAS;
    recortada = true;
  }
  // Las filas vacías del medio se quedan (separan bloques en la hoja), pero a lo ancho real.
  filas = filas.map((f) => Array.from({ length: ancho }, (_, i) => f[i] ?? ""));
  return { nombre: celda(nombre) || "Sin nombre", filas, ...(recortada ? { recortada: true } : {}) };
}

/** Las pestañas leídas → el Brief que se guarda (sin las vacías, con el tope de pestañas). */
export function briefDesdeLibro(
  libro: { titulo: string; url: string; pestanas: ReadonlyArray<{ nombre: string; celdas: readonly (readonly unknown[])[] }> },
  meta: { importadoEn: string; importadoPor: string },
): BriefImportado {
  const conAlgo = libro.pestanas.map((p) => pestanaDesdeCeldas(p.nombre, p.celdas)).filter((p): p is PestanaDelBrief => p !== null);
  const pestanas: PestanaDelBrief[] = [];
  let largo = 0;
  for (const p of conAlgo.slice(0, TOPE_DE_PESTANAS)) {
    const filas: string[][] = [];
    for (const f of p.filas) {
      const n = f.reduce((t, c) => t + c.length, 0);
      if (largo + n > TOPE_DEL_BRIEF) break;
      largo += n;
      filas.push(f);
    }
    if (filas.length) pestanas.push(filas.length < p.filas.length ? { ...p, filas, recortada: true } : p);
    if (filas.length < p.filas.length) break;
  }
  const sinTraer = conAlgo.length - pestanas.length;
  return {
    titulo: celda(libro.titulo),
    url: libro.url,
    importadoEn: meta.importadoEn,
    importadoPor: meta.importadoPor,
    pestanas,
    ...(sinTraer > 0 ? { pestanasSinTraer: sinTraer } : {}),
  };
}

/** Lee la data guardada con tolerancia (una data vieja o a medias no rompe la sección). */
export function adoptarBrief(data: unknown): BriefImportado {
  const d = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const pestanas = Array.isArray(d.pestanas)
    ? d.pestanas.flatMap((p): PestanaDelBrief[] => {
        if (!p || typeof p !== "object") return [];
        const x = p as Record<string, unknown>;
        const filas = Array.isArray(x.filas) ? x.filas.map((f) => (Array.isArray(f) ? f.map((c) => s(c)) : [])) : [];
        return [{ nombre: s(x.nombre) || "Sin nombre", filas, ...(x.recortada === true ? { recortada: true } : {}) }];
      })
    : [];
  const sinTraer = typeof d.pestanasSinTraer === "number" && d.pestanasSinTraer > 0 ? { pestanasSinTraer: d.pestanasSinTraer } : {};
  return { titulo: s(d.titulo), url: s(d.url), importadoEn: s(d.importadoEn), importadoPor: s(d.importadoPor), pestanas, ...sinTraer };
}

/** ¿No hay nada traído? */
export function briefImportadoVacio(data: unknown): boolean {
  return !adoptarBrief(data).pestanas.some((p) => p.filas.some((f) => f.some((c) => c.trim() !== "")));
}

/** Cuántas filas con algo trae el Brief (para el resumen «20 pestañas · 312 filas»). */
export function filasConAlgo(b: BriefImportado): number {
  return b.pestanas.reduce((n, p) => n + p.filas.filter((f) => f.some((c) => c !== "")).length, 0);
}

/**
 * El Brief para el agente de la Planificación: cada pestaña con sus filas con algo, celdas separadas por « | », hasta el
 * tope. "" si no hay nada.
 */
export function briefParaElPrompt(data: unknown, tope = TOPE_DEL_BRIEF_EN_EL_PROMPT): string {
  const b = adoptarBrief(data);
  if (briefImportadoVacio(b)) return "";
  const partes: string[] = [];
  let largo = 0;
  let cortado = false;
  for (const p of b.pestanas) {
    // Una celda vacía en el medio se marca: sin ella, los valores se corren de columna y Ana pasa a ser la probabilidad.
    const lineas = p.filas.filter((f) => f.some((c) => c !== "")).map((f) => {
      const hasta = f.reduce((u, c, i) => (c !== "" ? i : u), 0);
      return f.slice(0, hasta + 1).map((c) => c || "—").join(" | ");
    });
    if (!lineas.length) continue;
    const bloque = `## ${p.nombre}\n${lineas.join("\n")}`;
    if (largo + bloque.length > tope) {
      const resto = tope - largo;
      if (resto > 200) partes.push(`${bloque.slice(0, resto)}…`);
      cortado = true;
      break;
    }
    partes.push(bloque);
    largo += bloque.length + 2;
  }
  return partes.join("\n\n") + (cortado ? "\n\n(El Brief sigue: no entró entero.)" : "");
}
