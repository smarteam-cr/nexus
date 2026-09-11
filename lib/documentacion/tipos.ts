/**
 * lib/documentacion/tipos.ts — los tipos de la base de conocimiento del equipo (`/documentacion`).
 *
 * PURO y client-safe: lo importan el árbol (cliente), las rutas de la API y la siembra. No
 * importa BlockNote: un bloque guardado se describe por su FORMA, así el servidor puede leer y
 * sanear el contenido sin cargar el editor.
 *
 * ⛔ Nada de esto es `KnowledgeDocument` (la biblioteca que leen los agentes). Las páginas de
 * Documentación son para personas; ningún agente las lee.
 */

/**
 * Los bloques de fábrica de BlockNote que se ofrecen. Los de archivo (imagen, video, audio,
 * archivo) NO están: sin un lugar donde subirlos quedarían rotos. Es la lista ÚNICA — el esquema
 * del editor elige de acá, y `sanearBloques` reconoce con esto.
 */
export const TIPOS_DE_FABRICA = [
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "toggleListItem",
  "quote",
  "codeBlock",
  "table",
  "divider",
] as const;

/** Los bloques propios de Nexus: el aviso de color y el bloque que se arma solo desde el código. */
export const TIPOS_PROPIOS = ["aviso", "vivo"] as const;

export type TipoDeBloque = (typeof TIPOS_DE_FABRICA)[number] | (typeof TIPOS_PROPIOS)[number];

export const TIPOS_DE_BLOQUE: ReadonlySet<string> = new Set<string>([
  ...TIPOS_DE_FABRICA,
  ...TIPOS_PROPIOS,
]);

/** Un bloque del editor en su forma de JSON guardado. Estructural: no depende de BlockNote. */
export interface BloqueGuardado {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  /** Texto plano (código), contenido en línea (párrafos) o una tabla. */
  content?: unknown;
  children?: BloqueGuardado[];
}

/** Una página tal como la ve el árbol: sin su contenido. */
export interface NodoDePagina {
  id: string;
  parentId: string | null;
  slug: string;
  titulo: string;
  icono: string | null;
  orden: number;
  bloqueada: boolean;
  fija: boolean;
}

export interface NodoDelArbol extends NodoDePagina {
  hijas: NodoDelArbol[];
}

/** De dónde sale un bloque vivo: cada fuente se deriva de un registro del código. */
export const FUENTES_VIVAS = ["menu", "recorrido", "documentos", "agentes", "hubspot", "roles"] as const;
export type FuenteViva = (typeof FUENTES_VIVAS)[number];

/** Por qué se guardó una versión en el historial. */
export const MOTIVOS_DE_VERSION = [
  "autoguardado",
  "antes-de-restaurar",
  "semilla",
  "antes-de-forzar",
] as const;
export type MotivoDeVersion = (typeof MOTIVOS_DE_VERSION)[number];

/** Versiones guardadas por página: las más viejas se descartan. */
export const TOPE_DE_VERSIONES = 200;

/** Una foto nueva del historial solo si la última tiene más de esto, o si es de otra persona. */
export const MINUTOS_ENTRE_VERSIONES = 10;
