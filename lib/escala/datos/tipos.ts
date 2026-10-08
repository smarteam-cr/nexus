/**
 * lib/escala/datos/tipos.ts — la Escala de Rendimiento como DATOS. PURO.
 *
 * Desde el 2026-10-08 la escala no es un archivo `.md`: es esta estructura, guardada por versión en
 * la base (`EscalaVersion`). El `.md` se GENERA desde aquí (`generar.ts`) y se importa con
 * `importar.ts`; ida y vuelta da el mismo texto, byte por byte.
 *
 * Qué es estructura y qué es texto:
 *   · La MATRIZ (área → capa → dimensión → nivel → criterio) y las EDICIONES por industria son
 *     estructura: cada criterio con su identificador, su texto, cómo se verifica, sus marcas y lo que
 *     requiere; cada edición con lo que reescribe, sus criterios propios y lo que no aplica.
 *   · La PROSA (qué es la escala, cómo se aplica, la referencia, la introducción de las ediciones) es
 *     una lista de bloques de texto, en orden. Es la parte que sale de la escala cuando la teoría y el
 *     manual pasen a Documentación (docs/escala/plan-escala-como-datos.md).
 *
 * La forma de LECTURA que usan las pantallas sigue siendo `Escala` (lib/escala/documento/tipos.ts):
 * `escalaDeLosDatos` la arma desde aquí.
 */
import type { Letra, MarcaDePerfil, Verificacion } from "@/lib/escala/documento/tipos";

/** Sube si la forma de los datos cambia de una manera que una versión vieja no entiende. */
export const FORMATO_DE_LOS_DATOS = 1 as const;

export interface EscalaDatos {
  formato: typeof FORMATO_DE_LOS_DATOS;
  /** El encabezado del documento, en orden: `documento`, `version`, `fecha`, `estado`, `relacionados`. */
  encabezado: CampoDelEncabezado[];
  /** El documento entero, en orden. */
  partes: Parte[];
}

export interface CampoDelEncabezado {
  clave: string;
  valor: string;
}

/**
 * Una parte del documento. Empieza siempre con su título de nivel 1 (`# Parte 3 — La matriz`), que
 * es el primer bloque de `bloques`.
 */
export type Parte = ParteDeProsa | ParteDeLaMatriz | ParteDeEdiciones;

export interface ParteDeProsa {
  tipo: "prosa";
  bloques: Bloque[];
}

export interface ParteDeLaMatriz {
  tipo: "matriz";
  /** El título de la parte y su introducción. */
  bloques: Bloque[];
  areas: AreaDeLaMatriz[];
}

export interface ParteDeEdiciones {
  tipo: "ediciones";
  /** El título de la parte, qué es una edición y cómo se escribe. */
  bloques: Bloque[];
  ediciones: EdicionDeLaEscala[];
}

// ── La prosa ──────────────────────────────────────────────────────────────────

/** Un bloque de texto: lo que va entre dos líneas en blanco. */
export type Bloque =
  | { tipo: "titulo"; nivel: 1 | 2 | 3 | 4; texto: string }
  | { tipo: "parrafo"; texto: string }
  | { tipo: "lista"; items: string[] }
  | { tipo: "numerada"; items: string[] }
  | { tipo: "tabla"; columnas: string[]; alineacion: string[]; filas: string[][] }
  | { tipo: "separador" };

// ── La matriz ─────────────────────────────────────────────────────────────────

export interface AreaDeLaMatriz {
  /** `1` */
  id: string;
  nombre: string;
  /** «Mide el rendimiento del área de Ventas: …» */
  descripcion: string;
  /** Las dos capas, en orden: la base operativa y la producción. */
  capas: CapaDeLaMatriz[];
  /** Si después del área va una línea `---`. */
  separadorAlFinal: boolean;
}

export interface CapaDeLaMatriz {
  /** «Base operativa», «Producción». */
  nombre: string;
  dimensiones: DimensionDeLaMatriz[];
}

export interface DimensionDeLaMatriz {
  /** `1.7` */
  id: string;
  nombre: string;
  pregunta: string;
  descripcion: string | null;
  costoDeQuedarse: string;
  /** Los cinco, en orden. */
  niveles: NivelDeLaMatriz[];
}

export interface NivelDeLaMatriz {
  letra: Letra;
  /** La frase del nivel: lo que dice después de «**Funcional.**». */
  frase: string;
  /** La línea de resultado. Solo desde Funcional. */
  resultado: string | null;
  /** En Deficiente e Inicial son las señales; de Funcional para arriba, los criterios. */
  criterios: CriterioDeLaEscala[];
}

export interface CriterioDeLaEscala {
  /** `1.7.F1` */
  id: string;
  texto: string;
  verificacion: Verificacion;
  riesgo: boolean;
  habito: boolean;
  perfil: MarcaDePerfil | null;
  /** Los criterios que este necesita para poder cumplirse. Vacío si ninguno. */
  requiere: string[];
}

// ── Las ediciones por industria ───────────────────────────────────────────────

export interface EdicionDeLaEscala {
  /** «Ecommerce y retail» (el título: `## Edición — Ecommerce y retail`). */
  nombre: string;
  /** Para quién es. */
  descripcion: string | null;
  /** `ecommerce-retail`: estable aunque la edición cambie de nombre. */
  clave: string;
  /** Tal cual se escribe después de «*Perfil habitual:*»: «transaccional · recompra.». */
  perfilHabitual: string | null;
  /** Tal cual se escribe después de «*Criterios propios:*»: «desde el 101.». */
  criteriosPropios: string | null;
  /** La tabla «Palabras de esta edición», si la trae. */
  palabras: TablaDePalabras | null;
  areas: AreaDeLaEdicion[];
}

export interface TablaDePalabras {
  columnas: string[];
  alineacion: string[];
  filas: { general: string; edicion: string }[];
}

export interface AreaDeLaEdicion {
  /** `1` */
  id: string;
  /** Como la llama la edición («Admisiones»). */
  nombre: string;
  descripcion: string | null;
  /** El vistazo del área en cada nivel, en el orden en que está escrito. */
  panoramica: { letra: Letra; texto: string }[];
  dimensiones: DimensionDeLaEdicion[];
}

export interface DimensionDeLaEdicion {
  /** `1.7` */
  id: string;
  nombre: string;
  pregunta: string | null;
  descripcion: string | null;
  costoDeQuedarse: string | null;
  niveles: NivelDeLaEdicion[];
  /** Criterios de la escala general que en esta edición no aplican. */
  noAplican: string[];
  /** Criterios de la escala general que la edición deja como están. */
  seLeenIgual: string[];
}

export interface NivelDeLaEdicion {
  letra: Letra;
  /** La frase del nivel, si la edición la cambia. */
  frase: string | null;
  resultado: string | null;
  /** En el orden en que están escritos: reescritos de la escala general y propios de la edición. */
  criterios: CriterioDeLaEdicion[];
}

export type CriterioDeLaEdicion =
  /** Un criterio de la escala general dicho con las palabras de la edición (etiqueta con solo el id). */
  | { tipo: "reescrito"; id: string; texto: string }
  /** Un criterio que solo existe en esta edición (etiqueta completa, id de su bloque). */
  | ({ tipo: "propio" } & CriterioDeLaEscala);
