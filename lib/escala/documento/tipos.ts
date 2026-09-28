/**
 * lib/escala/documento/tipos.ts — la forma de la Escala de Rendimiento LEÍDA del documento. PURO.
 *
 * Todo lo que tiene contenido (nombres, preguntas, criterios, mensajes, definiciones) sale del
 * archivo publicado y lo llena `parsear.ts`: acá solo hay forma. Lo único que se escribe en código
 * es la gramática del documento —las letras de los niveles, las formas de verificación y las
 * marcas de perfil que admite la etiqueta—, que es la que define la especificación del cálculo.
 */

/** La letra del nivel en los identificadores (`1.7.F1`): Deficiente, Inicial, Funcional… */
export type Letra = "D" | "I" | "F" | "E" | "O";

/** Las cinco, en orden de madurez. Es gramática del identificador, no contenido. */
export const LETRAS: readonly Letra[] = ["D", "I", "F", "E", "O"];

/** Desde qué nivel los criterios describen lo que ya está en su lugar (y hay línea de resultado). */
export const LETRAS_CON_RESULTADO: readonly Letra[] = ["F", "E", "O"];

export type Verificacion = "comprobable" | "declarado" | "evaluado";
export const VERIFICACIONES: readonly Verificacion[] = ["comprobable", "declarado", "evaluado"];

/** Las marcas de perfil que admite la etiqueta de un criterio. */
export type MarcaDePerfil = "venta con equipo" | "cliente recurrente" | "relación continua";

/** Las dos capas de cada área, por su lugar en la matriz: la primera es la base. */
export type ClaveDeCapa = "base" | "produccion";

export interface NivelDeLaEscala {
  letra: Letra;
  /** Código del 1 al 5 (tabla «Niveles» de la Parte 4). */
  codigo: number;
  /** «Deficiente», «Óptimo»… con la grafía exacta de la escala. */
  nombre: string;
}

export interface CapaDeLaEscala {
  clave: ClaveDeCapa;
  nombre: string;
  /** «cómo está montado el departamento por dentro» (Parte 1), si la escala la trae. */
  descripcion: string | null;
}

export interface Criterio {
  /** `1.7.F1` */
  id: string;
  texto: string;
  verificacion: Verificacion;
  riesgo: boolean;
  habito: boolean;
  perfil: MarcaDePerfil | null;
}

export interface Nivel {
  /** `1.7.F` */
  id: string;
  letra: Letra;
  descripcion: string;
  /** La línea de resultado. Solo desde Funcional. */
  resultado: string | null;
  criterios: Criterio[];
}

export interface Dimension {
  /** `1.7` */
  id: string;
  /** `1` */
  area: string;
  nombre: string;
  capa: ClaveDeCapa;
  pregunta: string;
  costoDeQuedarse: string;
  /** El nombre genérico que la dimensión comparte en las tres áreas («Presentación», «Datos»…). */
  generica: { nombre: string; descripcion: string | null } | null;
  niveles: Nivel[];
}

export interface Area {
  /** `1` */
  id: string;
  nombre: string;
  /** `ventas`: para la URL. Se deriva del nombre. */
  slug: string;
  descripcion: string;
  /** Cómo se ve el área entera en cada nivel («Los cinco niveles de un vistazo»). */
  panoramica: Partial<Record<Letra, string>>;
  dimensiones: Dimension[];
}

export interface OrdenDeDependencias {
  capa: string;
  cuando: string;
  orden: string[];
  porQue: string;
}

export interface EntradaDelHistorial {
  version: string;
  fecha: string;
  texto: string;
}

export interface Escala {
  version: string;
  fecha: string | null;
  /** «Congelada hasta usarla con cinco a diez clientes reales». */
  estado: string | null;
  niveles: NivelDeLaEscala[];
  capas: CapaDeLaEscala[];
  areas: Area[];
  /** Id de un criterio de riesgo → el mensaje que ve el cliente cuando no se cumple. */
  riesgos: Record<string, string>;
  glosario: { termino: string; significado: string }[];
  /** Qué quiere decir cada forma de verificación, con las palabras de la escala. */
  verificacion: Partial<Record<Verificacion, string>>;
  /** Los párrafos que explican las marcas riesgo y hábito, para la leyenda. */
  explicaciones: { riesgo: string | null; habito: string | null; perfil: string | null };
  dependencias: OrdenDeDependencias[];
  historial: EntradaDelHistorial[];
}

/** El documento de la escala tenía algo que el lector no entiende. Lleva la línea (desde 1). */
export class ErrorDeFormato extends Error {
  constructor(
    message: string,
    public readonly linea: number | null = null,
  ) {
    super(linea ? `Línea ${linea}: ${message}` : message);
    this.name = "ErrorDeFormato";
  }
}
