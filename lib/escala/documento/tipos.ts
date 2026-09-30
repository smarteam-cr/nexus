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

/** Las marcas de perfil que admite la etiqueta de un criterio («venta sin vendedor» y «recompra», desde la 7.7.0). */
export type MarcaDePerfil = "venta con equipo" | "venta sin vendedor" | "cliente recurrente" | "recompra" | "relación continua";
export const MARCAS_DE_PERFIL: readonly MarcaDePerfil[] = [
  "venta con equipo",
  "venta sin vendedor",
  "cliente recurrente",
  "recompra",
  "relación continua",
];

/** Las respuestas del perfil de negocio (Parte 2): cómo se cierra la venta y qué pasa después. */
export type Cierre = "con equipo" | "transaccional" | "mixta";
export type Despues = "única" | "recompra" | "continua";
export const CIERRES: readonly Cierre[] = ["con equipo", "transaccional", "mixta"];
export const DESPUES: readonly Despues[] = ["única", "recompra", "continua"];

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
  /**
   * Los criterios que este necesita para poder cumplirse (`· requiere 1.5.F1, 1.6.F2` en la
   * etiqueta, desde la 8.3.0): de OTRA dimensión, o de un nivel anterior de la suya. Es para leer la
   * escala y ordenar el trabajo; no cambia el cálculo. Sin requeridos, el campo no está.
   */
  requiere?: string[];
  /** Solo en una escala vista por una edición (`aplicarEdicion`): el criterio existe solo en ella. */
  propio?: true;
  /** Solo en una escala vista por una edición: cómo lo dice la escala general (la edición lo reescribió). */
  textoGeneral?: string;
}

export interface Nivel {
  /** `1.7.F` */
  id: string;
  letra: Letra;
  descripcion: string;
  /** La línea de resultado. Solo desde Funcional. */
  resultado: string | null;
  criterios: Criterio[];
  /** Solo en una escala vista por una edición: los criterios de la escala general que ahí no aplican. */
  noAplican?: Criterio[];
}

export interface Dimension {
  /** `1.7` */
  id: string;
  /** `1` */
  area: string;
  nombre: string;
  /** Solo en una escala vista por una edición que le cambió el nombre: cómo se llama en la general. */
  nombreGeneral?: string;
  capa: ClaveDeCapa;
  pregunta: string;
  /** «*Descripción:*»: qué mide la dimensión, en 15 a 20 palabras, entre la pregunta y el costo (opcional para el lector). */
  descripcion: string | null;
  costoDeQuedarse: string;
  /** El nombre genérico que la dimensión comparte en las tres áreas («Presentación», «Datos»…). */
  generica: { nombre: string; descripcion: string | null } | null;
  niveles: Nivel[];
}

export interface Area {
  /** `1` */
  id: string;
  nombre: string;
  /** Solo en una escala vista por una edición que le cambió el nombre: cómo se llama en la general. */
  nombreGeneral?: string;
  /** `ventas`: para la URL. Se deriva del nombre de la escala general (una edición no lo cambia). */
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

/** Una palabra de los criterios con valor fijo («la mayoría» = al menos 80%). */
export interface PalabraConValorFijo {
  /** Como la escribe la escala, sin comillas: «La mayoría». */
  termino: string;
  significado: string;
}

/** Una de las dos preguntas del perfil de negocio, con la definición de cada respuesta. */
export interface PreguntaDelPerfil {
  /** «Cómo se cierra la venta». */
  pregunta: string;
  opciones: { nombre: string; definicion: string }[];
}

/** Un párrafo o un punto de lista de la prosa de la escala, con sus negritas de markdown. */
export interface BloqueDeTexto {
  tipo: "parrafo" | "punto";
  texto: string;
}

/** Una regla de asignación («el forecast se asigna a Datos de Ventas (1.3)…») y a qué dimensiones toca. */
export interface ReglaDeAsignacion {
  /** Con sus negritas de markdown (`**…**`). */
  texto: string;
  /** Ids de dimensión que la regla nombra (o, sin ids, por su nombre genérico en negrita). */
  dimensiones: string[];
}

export interface Escala {
  version: string;
  fecha: string | null;
  /** El estado del encabezado, tal cual: «En revisión: cambia con el feedback de su responsable…». */
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
  /**
   * La prosa de la Parte 2 que explica las marcas. `evaluacion`: cómo se evalúa una dimensión (la
   * regla estricta, «por lo que busca, no por su letra», los criterios condicionados).
   * `requeridos`: qué quiere decir que un criterio requiera otro (desde la 8.3.0).
   */
  explicaciones: { evaluacion: string | null; riesgo: string | null; habito: string | null; perfil: string | null; requeridos: string | null };
  dependencias: OrdenDeDependencias[];
  historial: EntradaDelHistorial[];
  /** «Cómo se leen los criterios»: las palabras con valor fijo. */
  palabrasConValorFijo: PalabraConValorFijo[];
  /** «Cómo se leen los criterios»: los casos que se leen distinto (departamentos de una o dos personas…). */
  casosDeLectura: BloqueDeTexto[];
  /**
   * «El perfil de negocio»: la introducción, las dos preguntas con sus respuestas y el resto de sus
   * párrafos (cómo se lee la venta transaccional, qué unidad se diagnostica…).
   */
  perfilDeNegocio: {
    introduccion: string | null;
    cierre: PreguntaDelPerfil | null;
    despues: PreguntaDelPerfil | null;
    notas: string[];
  };
  /** «Regla de automatización»: manual → con lógica → autónomo, el desempate entre niveles. */
  automatizacion: BloqueDeTexto[];
  /** «Regla de asignación»: dónde se cuenta cada evidencia dudosa. */
  asignacion: ReglaDeAsignacion[];
  /** «Ediciones por industria» (desde la 8.0.0): la misma escala dicha para una industria. */
  ediciones: Edicion[];
  /** Qué es una edición, con las palabras de la escala (el primer párrafo de esa parte). */
  edicionesIntro: string | null;
  /**
   * Con qué edición se está viendo ESTA escala. En la que sale de `parsearEscala` es null (la
   * general); `aplicarEdicion` devuelve otra Escala, con los textos y criterios de la edición.
   */
  edicion: EdicionAplicada | null;
}

// ── Ediciones por industria ───────────────────────────────────────────────────
// Una edición NO es otra escala: comparte áreas, dimensiones, niveles, reglas e identificadores.
// Dice lo que cambia: nombres, preguntas, costos, criterios con sus palabras, criterios propios y
// los de la escala general que ahí no aplican. Lo que no dice, vale como está en la matriz.

/** Lo que una edición cambia de un nivel de una dimensión. */
export interface EdicionDeNivel {
  descripcion: string | null;
  resultado: string | null;
}

/** Lo que una edición cambia de una dimensión. Todo es opcional menos el nombre (el de su título). */
export interface EdicionDeDimension {
  /** `1.7` */
  id: string;
  /** Como la llama la edición. En la base operativa tiene que ser el nombre de la escala general. */
  nombre: string;
  pregunta: string | null;
  descripcion: string | null;
  costoDeQuedarse: string | null;
  niveles: Partial<Record<Letra, EdicionDeNivel>>;
  /** Criterios de la escala general dichos con las palabras de la edición: id → texto. */
  textos: Record<string, string>;
  /** Criterios que solo existen en esta edición, en el orden en que están escritos. */
  propios: Criterio[];
  /** Criterios de la escala general que no aplican en esta edición. */
  noAplican: string[];
  /**
   * Criterios de la escala general que la edición decidió dejar con su texto («Se leen igual»). Si
   * una edición toca los criterios de una dimensión, tiene que decir algo de TODOS: así un criterio
   * nuevo de la matriz no aparece en la edición sin que nadie lo haya decidido.
   */
  seLeenIgual: string[];
}

export interface EdicionDeArea {
  /** `1` */
  id: string;
  /** Como la llama la edición («Admisiones» en vez de «Ventas»). */
  nombre: string;
  descripcion: string | null;
  panoramica: Partial<Record<Letra, string>>;
  dimensiones: EdicionDeDimension[];
}

export interface Edicion {
  /**
   * `ecommerce-retail`: su «Clave», ESTABLE aunque la edición cambie de nombre. Va en la URL y se
   * guarda con cada comentario hecho desde la edición.
   */
  slug: string;
  nombre: string;
  /** Para quién es, en un párrafo. */
  descripcion: string | null;
  /** El perfil de negocio con el que arranca quien elige la edición. */
  perfilHabitual: { cierre: Cierre; despues: Despues } | null;
  /**
   * Desde qué número van sus criterios propios (101 → del 101 al 199). Cada edición tiene su bloque,
   * para que un criterio propio no se cruce con la numeración de la matriz ni con la de otra edición.
   */
  bloque: number | null;
  /** Cómo se llama en la industria cada cosa de la escala general: «Deal» → «Pedido o carrito». */
  palabras: { general: string; edicion: string }[];
  areas: EdicionDeArea[];
}

/** La edición con que se está viendo una escala, y cuánto cambió de la general. */
export interface EdicionAplicada {
  slug: string;
  nombre: string;
  descripcion: string | null;
  perfilHabitual: Edicion["perfilHabitual"];
  palabras: Edicion["palabras"];
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
