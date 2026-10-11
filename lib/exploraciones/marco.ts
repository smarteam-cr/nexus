/**
 * lib/exploraciones/marco.ts — QUÉ SE EXPLORA: el marco de la venta o el de Customer Success. PURO.
 *
 * Pedido de Elías (2026-10-07): «copia todo el módulo de exploración de las preventas y aplícalo a los
 * proyectos… la única diferencia deberían ser las preguntas: Customer Success debería hacer más
 * preguntas sobre la escala y sobre estrategia: los retos que el cliente tiene, los resultados que
 * persigue y los obstáculos que los impiden».
 *
 * La exploración de un proyecto es una fila de `ExploracionDeVenta` con `projectId` y `marco = "cs"`:
 * el mismo lienzo, las mismas sesiones (Preparación, En vivo, Análisis), la misma guía y la misma
 * lectura de reuniones. Lo que cambia por marco vive acá y en ningún otro lado:
 *   · `venta` — la arquitectura de la venta: las ocho tarjetas del marco de calificación de HubSpot.
 *   · `cs` — la estrategia del cliente: retos, resultados que persigue y obstáculos. Hasta cinco
 *     dimensiones de la escala por sesión (la venta, cuatro): Customer Success explora más la escala.
 *
 * ⛔ Toda lectura de VENTAS (listado de preventas, «Para ti», la propuesta, el handoff, el acceso a un
 * prospecto) filtra con `DE_LA_PREVENTA`: una exploración de proyecto no es una preventa. Lo vigila
 * lib/exploraciones/marco.test.ts.
 */
import { CASILLAS_DEL_RESUMEN, definicionDe, type ClaveDeCasilla, type DefinicionDeCasilla } from "./casillas";

/** El filtro de Prisma de toda lectura de preventas: las exploraciones de un proyecto no lo son. */
export const DE_LA_PREVENTA = { projectId: null } as const;

export type ClaveDeMarco = "venta" | "cs";

/** Lo que dice una tarjeta en un marco, si no es lo de su casilla. */
export interface TextosDeTarjeta {
  etiqueta: string;
  ayuda: string;
  explicacion?: string;
  ejemplo?: string;
}

export interface Marco {
  clave: ClaveDeMarco;
  /** El nombre de la columna de las tarjetas en la guía y en el panel. */
  nombre: string;
  /** Las tarjetas, en el orden en que se muestran. */
  tarjetas: readonly ClaveDeCasilla[];
  /** En qué orden se preguntan las que faltan. */
  prioridad: readonly ClaveDeCasilla[];
  /** La letra de cada tarjeta y su nombre en inglés (el marco del que sale). */
  letras: Readonly<Record<string, { letra: string; marco: string }>>;
  /** La pregunta de base de cada tarjeta, en lenguaje llano, tuteando al cliente. */
  preguntaDeBase: Readonly<Partial<Record<ClaveDeCasilla, string>>>;
  /** Lo que dice cada tarjeta en este marco, si no es lo de su casilla. */
  textos: Readonly<Partial<Record<ClaveDeCasilla, TextosDeTarjeta>>>;
  /** Hasta cuántas tarjetas vacías pregunta una sesión. */
  maxTarjetas: number;
  /** Hasta cuántas dimensiones sin evidencia pregunta una sesión. */
  maxDimensiones: number;
  /** Si la guía trae el manejo de objeciones (LAER): solo la venta. */
  conObjeciones: boolean;
}

/** Las preguntas de base de la venta (las de siempre). */
const PREGUNTAS_DE_LA_VENTA = {
  metas: "¿Qué quieres lograr este año? ¿De cuánto a cuánto, y para cuándo?",
  planes: "¿Qué han intentado hasta ahora para llegar?",
  retos: "¿Qué los frena hoy?",
  tiempos: "¿Para cuándo lo necesitan? ¿Hay alguna fecha que mande, como una renovación o un lanzamiento?",
  presupuesto: "¿Tienen un rango de inversión pensado para esto, o contra qué lo van a comparar?",
  autoridad: "Además de ti, ¿quién tiene que estar de acuerdo para avanzar? ¿Quién da el visto bueno final?",
  consecuencias: "Si esto sigue igual seis meses más, ¿qué pasa? ¿Cuánto les cuesta?",
  implicaciones: "Si lo logran, ¿qué cambia para el negocio, y para ti?",
} as const satisfies Record<(typeof CASILLAS_DEL_RESUMEN)[number], string>;

export const MARCO_DE_VENTA: Marco = {
  clave: "venta",
  nombre: "Arquitectura de la venta",
  tarjetas: CASILLAS_DEL_RESUMEN,
  prioridad: ["metas", "retos", "consecuencias", "autoridad", "tiempos", "implicaciones", "planes", "presupuesto"],
  letras: {
    metas: { letra: "G", marco: "Goals" },
    planes: { letra: "P", marco: "Plans" },
    retos: { letra: "C", marco: "Challenges" },
    tiempos: { letra: "T", marco: "Timeline" },
    presupuesto: { letra: "B", marco: "Budget" },
    autoridad: { letra: "A", marco: "Authority" },
    consecuencias: { letra: "C", marco: "Consequences" },
    implicaciones: { letra: "I", marco: "Implications" },
  },
  preguntaDeBase: PREGUNTAS_DE_LA_VENTA,
  textos: {},
  maxTarjetas: 5,
  maxDimensiones: 4,
  conObjeciones: true,
};

/**
 * La estrategia del cliente, para Customer Success. Las tres tarjetas reusan casillas que ya existen
 * (`retos`, `metas`) más `obstaculos`: lo que el agente sabe proponer, guardar y verificar es lo mismo.
 */
export const MARCO_DE_CS: Marco = {
  clave: "cs",
  nombre: "Estrategia",
  tarjetas: ["retos", "metas", "obstaculos"],
  prioridad: ["retos", "metas", "obstaculos"],
  letras: {
    retos: { letra: "C", marco: "Challenges" },
    metas: { letra: "G", marco: "Goals" },
    obstaculos: { letra: "O", marco: "Obstacles" },
  },
  preguntaDeBase: {
    retos: "¿Cuáles son hoy los retos más grandes del negocio? ¿Qué les quita el sueño este año?",
    metas: "¿Qué resultados persiguen con este proyecto? ¿De cuánto a cuánto, y para cuándo?",
    obstaculos: "¿Qué les impide llegar hoy a esos resultados? ¿Qué ya intentaron y no funcionó?",
  },
  textos: {
    retos: {
      etiqueta: "Retos",
      ayuda: "Los retos que el cliente tiene hoy en su negocio, en sus palabras.",
      explicacion:
        "Lo que le preocupa al negocio este año: crecer, retener clientes, ordenar la operación. No es lo que falla en HubSpot: es el problema de negocio que el proyecto tiene que ayudar a resolver.",
      ejemplo: "Están perdiendo clientes en el segundo año y no saben por qué.",
    },
    metas: {
      etiqueta: "Resultados que persigue",
      ayuda: "En cifras: de cuánto a cuánto y para cuándo. Son el criterio de éxito del proyecto.",
      explicacion:
        "Adónde quiere llegar el cliente con el proyecto, dicho con números: de dónde parte, adónde quiere llegar y para cuándo. Si el handoff ya los trae, confírmalos; si no traen cifra, pregunta «¿cuánto es hoy?» y «¿cuánto sería bueno?».",
      ejemplo: "Bajar la pérdida de clientes del segundo año del 30 % al 15 % antes de junio.",
    },
    obstaculos: {
      etiqueta: "Obstáculos",
      ayuda: "Lo que hoy le impide llegar a esos resultados. Suelen salir de las dimensiones bajas de la escala.",
      explicacion:
        "Lo que se interpone entre el cliente y sus resultados: un proceso que nadie sigue, datos que no se confían, un equipo sin tiempo. Atarlos a una dimensión de la escala ayuda a decidir por dónde empezar.",
      ejemplo: "Cada vendedor lleva sus clientes en su Excel: nadie ve cuándo uno deja de comprar.",
    },
  },
  maxTarjetas: 3,
  maxDimensiones: 5,
  conObjeciones: false,
};

export function marcoDe(clave: string | null | undefined): Marco {
  return clave === "cs" ? MARCO_DE_CS : MARCO_DE_VENTA;
}

/** Si `para` es una tarjeta de algún marco (y no una dimensión de la escala). */
const TODAS_LAS_TARJETAS = new Set<string>([...MARCO_DE_VENTA.tarjetas, ...MARCO_DE_CS.tarjetas]);
export function esTarjeta(para: string): para is ClaveDeCasilla {
  return TODAS_LAS_TARJETAS.has(para);
}

/** La definición de una casilla como se dice en este marco (el nombre, la ayuda y el ejemplo). */
export function definicionEnElMarco(clave: ClaveDeCasilla, marco: Marco): DefinicionDeCasilla {
  const base = definicionDe(clave);
  const t = marco.textos[clave];
  return t ? { ...base, ...t } : base;
}
