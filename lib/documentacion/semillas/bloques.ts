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

/** Un enlace a otra página sembrada. El id lo completa la siembra, que es la que lo conoce. */
export interface MencionASembrar {
  mencionA: string;
  titulo: string;
  icono?: string;
}

/** Un enlace a una dirección de AFUERA. Adentro de la base se enlaza con `mencion`. */
export interface EnlaceASembrar {
  enlaceA: string;
  texto: string;
}

/** Texto con formato: `t("normal", ["negrita", { negrita: true }], { mencionA: "slug", … })`. */
export type Pieza =
  | string
  | [texto: string, estilos: { negrita?: boolean; italica?: boolean; codigo?: boolean }]
  | MencionASembrar
  | EnlaceASembrar;

function enLinea(piezas: Pieza[]): unknown[] {
  return piezas.map((pieza) => {
    if (typeof pieza === "string") return { type: "text", text: pieza, styles: {} };
    if (Array.isArray(pieza)) {
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
    }
    if ("enlaceA" in pieza) {
      return {
        type: "link",
        href: pieza.enlaceA,
        content: [{ type: "text", text: pieza.texto, styles: {} }],
      };
    }
    /* `paginaId` queda vacío a propósito: la siembra lo completa cuando todas las páginas existen
       y sus ids se conocen. Con el slug solo, el enlace ya funciona; con el id, además aparece en
       el «Enlazan acá» de la página destino. */
    return {
      type: "mencion",
      props: { paginaId: "", slug: pieza.mencionA, titulo: pieza.titulo, icono: pieza.icono ?? "" },
    };
  });
}

/** Un enlace a otra página, para usar dentro de `parrafoRico`. */
export const mencion = (slug: string, titulo: string, icono?: string): MencionASembrar => ({
  mencionA: slug,
  titulo,
  icono,
});

/**
 * Completa el `paginaId` de cada mención con el id real de la página que nombra.
 *
 * Se corre DESPUÉS de crear todas las páginas: al armar el contenido, la página destino todavía
 * puede no existir. Sin el id, el enlace igual anda (tiene el slug), pero la página destino no
 * sabría quién la nombra — y esa vuelta es la mitad del valor de enlazar.
 */
export function resolverMenciones(
  bloques: BloqueGuardado[],
  idPorSlug: Map<string, string>,
): BloqueGuardado[] {
  const enContenido = (contenido: unknown): unknown => {
    if (!Array.isArray(contenido)) return contenido;
    return contenido.map((pieza) => {
      if (!pieza || typeof pieza !== "object") return pieza;
      const p = pieza as { type?: unknown; props?: { slug?: unknown; paginaId?: unknown } };
      if (p.type !== "mencion" || typeof p.props?.slug !== "string") return pieza;
      const id = idPorSlug.get(p.props.slug);
      return id ? { ...p, props: { ...p.props, paginaId: id } } : pieza;
    });
  };

  return bloques.map((b) => ({
    ...b,
    content: enContenido(b.content),
    ...(b.children ? { children: resolverMenciones(b.children, idPorSlug) } : {}),
  }));
}

/** Un enlace de afuera, para usar dentro de `parrafoRico`. */
export const enlace = (texto: string, url: string): EnlaceASembrar => ({ enlaceA: url, texto });

export const titulo = (nivel: 1 | 2 | 3 | 4, texto: string): BloqueGuardado => ({
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

/** Un ítem con casilla, para las listas de «esto se hace». */
export const tarea = (texto: string): BloqueGuardado => ({
  type: "checkListItem",
  props: { checked: false },
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

/**
 * Una tarjeta: el título se ve en grande y el cuerpo debajo. Vive siempre adentro de `tarjetas`.
 * El cuerpo admite varios párrafos, que es lo que la diferencia de una viñeta.
 */
export const tarjeta = (encabezado: string, ...cuerpo: (string | BloqueGuardado)[]): BloqueGuardado => ({
  type: "tarjeta",
  content: encabezado,
  children: cuerpo.map((c) => (typeof c === "string" ? parrafo(c) : c)),
});

/** La rejilla de tarjetas: una, dos o tres columnas. */
export const tarjetas = (
  columnas: "1" | "2" | "3",
  ...hijas: BloqueGuardado[]
): BloqueGuardado => ({
  type: "tarjetas",
  props: { columnas },
  children: hijas,
});

/** El bloque que se arma solo desde los registros de Nexus. */
export const bloqueVivo = (fuente: Fuente): BloqueGuardado => ({ type: "vivo", props: { fuente } });
