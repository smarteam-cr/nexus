/**
 * lib/documentacion/semillas/bloques.ts — los ladrillos con los que se arman las páginas sembradas.
 *
 * El contenido de una página es JSON de bloques. Escribirlo a mano es ilegible y se equivoca en
 * silencio (una coma de más y la página no abre), así que las semillas se arman con estas
 * funciones: una por tipo de bloque, con la forma exacta que espera el editor.
 *
 * PURO: no importa BlockNote. La forma vive en `lib/documentacion/tipos.ts` y la vigila
 * `sanearBloques` al cargar.
 */
import type { BloqueGuardado } from "../tipos";

/** Una página a sembrar, con sus subpáginas. */
export interface PaginaSembrada {
  slug: string;
  titulo: string;
  icono: string;
  bloques: BloqueGuardado[];
  hijas?: PaginaSembrada[];
}

export type Tono = "info" | "advertencia" | "exito" | "peligro";
export type Fuente = "menu" | "recorrido" | "documentos" | "agentes" | "hubspot" | "roles";

/** Texto con formato: `t("normal", ["negrita", { negrita: true }])`. */
export type Pieza = string | [texto: string, estilos: { negrita?: boolean; italica?: boolean; codigo?: boolean }];

function enLinea(piezas: Pieza[]): unknown[] {
  return piezas.map((pieza) => {
    if (typeof pieza === "string") return { type: "text", text: pieza, styles: {} };
    const [texto, estilos] = pieza;
    return {
      type: "text",
      text: texto,
      styles: {
        ...(estilos.negrita ? { bold: true } : {}),
        ...(estilos.italica ? { italic: true } : {}),
        ...(estilos.codigo ? { code: true } : {}),
      },
    };
  });
}

export const titulo = (nivel: 1 | 2 | 3, texto: string): BloqueGuardado => ({
  type: "heading",
  props: { level: nivel },
  content: texto,
});

export const parrafo = (texto: string): BloqueGuardado => ({ type: "paragraph", content: texto });

/** Un párrafo con partes en negrita o itálica. */
export const parrafoRico = (...piezas: Pieza[]): BloqueGuardado => ({
  type: "paragraph",
  content: enLinea(piezas),
});

export const vinneta = (texto: string): BloqueGuardado => ({
  type: "bulletListItem",
  content: texto,
});

export const numerado = (texto: string): BloqueGuardado => ({
  type: "numberedListItem",
  content: texto,
});

export const cita = (texto: string): BloqueGuardado => ({ type: "quote", content: texto });

export const divisor = (): BloqueGuardado => ({ type: "divider" });

/** El recuadro de color. `texto` admite formato. */
export const aviso = (tono: Tono, ...piezas: Pieza[]): BloqueGuardado => ({
  type: "aviso",
  props: { tono },
  content: enLinea(piezas),
});

/** El desplegable: el título se ve, los hijos aparecen al abrirlo. */
export const desplegable = (encabezado: string, hijos: BloqueGuardado[]): BloqueGuardado => ({
  type: "toggleListItem",
  content: encabezado,
  children: hijos,
});

/** Una tabla simple: la primera fila es el encabezado. */
export const tabla = (filas: string[][]): BloqueGuardado => ({
  type: "table",
  content: {
    type: "tableContent",
    rows: filas.map((celdas) => ({ cells: celdas })),
  },
});

/** El bloque que se arma solo desde los registros de Nexus. */
export const bloqueVivo = (fuente: Fuente): BloqueGuardado => ({ type: "vivo", props: { fuente } });
