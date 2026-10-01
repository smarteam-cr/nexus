/**
 * lib/exploraciones/casillas.ts — qué casillas tiene el lienzo de una exploración de venta. PURO.
 *
 * El lienzo combina la escala (dónde está hoy la operación) con el marco de calificación de HubSpot
 * (metas, planes, retos, tiempos, presupuesto y autoridad, más las consecuencias de no actuar y lo
 * que cambia si se logra: adónde quiere llegar el cliente y si hay un negocio real). Cada casilla
 * declara acá su forma, en qué paso del lienzo vive y A DÓNDE PUEDE LLEGAR:
 *
 *   - `alCliente`: si puede entrar a la propuesta, que la ve el cliente. Las hipótesis, el
 *     presupuesto, quién decide, lo que nadie exploró y la apertura a la asesoría NO: son internas.
 *   - `alHandoff`: cómo le llega al CSE. «interno» va rotulado «solo interno» para que el handoff lo
 *     ponga en sus secciones internas, las que ningún documento del cliente lee.
 *
 * ⚠ SIN zod a propósito: lo importan las pantallas, y zod pesa 266 KB en el navegador
 * (lib/auth/client-safe.test.ts). Los esquemas que validan estas formas viven en `esquemas.ts`.
 * Lo que dice cada casilla lo escribe el vendedor o lo propone el agente; acá solo hay forma.
 */

// ── Las formas de los valores ─────────────────────────────────────────────────

/** Una meta del cliente. «En cifras» = el objetivo trae un número (ver `metaEnCifras`). */
export interface Meta {
  que: string;
  /** De cuánto parte, si lo dijo («hoy cerramos 4 de cada 10»). */
  actual?: string;
  /** A cuánto quiere llegar («7 de cada 10»). */
  objetivo?: string;
  /** Para cuándo («antes de diciembre»). */
  para?: string;
}

/** Una persona en la decisión: quién firma, quién decide, quién influye y a quién más afecta. */
export const ROLES_EN_LA_DECISION = ["firma", "decide", "influye", "afectado"] as const;
export type RolEnLaDecision = (typeof ROLES_EN_LA_DECISION)[number];
export const ETIQUETA_DEL_ROL: Record<RolEnLaDecision, string> = {
  firma: "Firma",
  decide: "Decide",
  influye: "Influye",
  afectado: "Le afecta",
};
export interface Persona {
  nombre: string;
  cargo?: string;
  rol: RolEnLaDecision;
  nota?: string;
}

/** Un reto, atado a la dimensión de la escala de la que sale si se sabe cuál es. */
export interface Reto {
  texto: string;
  dimensionId?: string;
}

export interface SiguientePaso {
  que: string;
  /** `AAAA-MM-DD`. Sin fecha no cuenta como «siguiente paso con fecha». */
  fecha?: string;
  conQuien?: string;
}

export const VALORES_DE_APERTURA = ["si", "no", "no_se"] as const;
export interface Apertura {
  valor: (typeof VALORES_DE_APERTURA)[number];
  porQue?: string;
}

// ── Las casillas ──────────────────────────────────────────────────────────────

/** Los tipos de casilla. Las de lista reciben del agente UN ítem por propuesta; las demás, el valor entero. */
export type TipoDeCasilla = "texto" | "lista" | "metas" | "retos" | "autoridad" | "siguientePaso" | "apertura";

export type PasoDelLienzo = "preparacion" | "quedo";

export interface DefinicionDeCasilla {
  clave: ClaveDeCasilla;
  etiqueta: string;
  /** Qué va, en una línea, para quien la llena. */
  ayuda: string;
  paso: PasoDelLienzo;
  tipo: TipoDeCasilla;
  /** Puede entrar a la propuesta (la ve el cliente). */
  alCliente: boolean;
  /** Cómo le llega al CSE en el handoff. */
  alHandoff: "normal" | "interno";
}

export const CLAVES_DE_CASILLA = [
  "contexto",
  "hubspotActual",
  "hipotesis",
  "metas",
  "planes",
  "retos",
  "tiempos",
  "consecuencias",
  "implicaciones",
  "presupuesto",
  "autoridad",
  "portal",
  "noExplorado",
  "producto",
  "apertura",
  "siguientePaso",
] as const;
export type ClaveDeCasilla = (typeof CLAVES_DE_CASILLA)[number];

export const CASILLAS: readonly DefinicionDeCasilla[] = [
  // ── Preparación ──
  {
    clave: "contexto",
    etiqueta: "Lo que ya sabemos",
    ayuda: "Qué hace la empresa, cómo llegó y lo que ya se habló, con su fuente.",
    paso: "preparacion",
    tipo: "texto",
    alCliente: false,
    alHandoff: "normal",
  },
  {
    clave: "hubspotActual",
    etiqueta: "Su HubSpot hoy",
    ayuda: "Qué hubs y ediciones tiene, cuántos usuarios, quién lo configuró y cuándo renueva.",
    paso: "preparacion",
    tipo: "texto",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "hipotesis",
    etiqueta: "Hipótesis",
    ayuda: "«Creemos que… porque…». Para confirmar o descartar en la reunión, nunca para afirmar.",
    paso: "preparacion",
    tipo: "lista",
    alCliente: false,
    alHandoff: "interno",
  },
  // ── Lo que quedó: adónde quiere llegar y si hay negocio ──
  {
    clave: "metas",
    etiqueta: "Metas",
    ayuda: "En cifras: de cuánto a cuánto y para cuándo. Son el criterio de éxito y la base del precio.",
    paso: "quedo",
    tipo: "metas",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "planes",
    etiqueta: "Planes",
    ayuda: "Lo que ya intentaron o piensan hacer para llegar.",
    paso: "quedo",
    tipo: "lista",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "retos",
    etiqueta: "Retos",
    ayuda: "Lo que hoy les impide llegar. Salen de las dimensiones bajas de la escala.",
    paso: "quedo",
    tipo: "retos",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "tiempos",
    etiqueta: "Tiempos",
    ayuda: "Para cuándo lo necesitan y qué fechas mandan (una renovación, un lanzamiento, el cierre del año).",
    paso: "quedo",
    tipo: "lista",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "consecuencias",
    etiqueta: "Qué pasa si no actúa",
    ayuda: "Lo que le cuesta quedarse como está, mejor con su número.",
    paso: "quedo",
    tipo: "lista",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "implicaciones",
    etiqueta: "Qué cambia si lo logra",
    ayuda: "Lo que gana el negocio al llegar a la meta, en sus palabras.",
    paso: "quedo",
    tipo: "lista",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "presupuesto",
    etiqueta: "Presupuesto",
    ayuda: "El rango que tienen, o contra qué lo van a comparar.",
    paso: "quedo",
    tipo: "texto",
    alCliente: false,
    alHandoff: "interno",
  },
  {
    clave: "autoridad",
    etiqueta: "Quién decide",
    ayuda: "Quién firma, quién decide, quién influye y a quién más le afecta la decisión.",
    paso: "quedo",
    tipo: "autoridad",
    alCliente: false,
    alHandoff: "interno",
  },
  // ── Lo que quedó: la exploración misma ──
  {
    clave: "portal",
    etiqueta: "Lo que vimos en el portal",
    ayuda: "Lo que se vio con el portal abierto: lo que está, lo que falta y lo que nadie documentó.",
    paso: "quedo",
    tipo: "lista",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "noExplorado",
    etiqueta: "Lo que se dijo y nadie exploró",
    ayuda: "Pistas que el cliente dio y nadie siguió. Cada una: qué dijo y qué preguntar la próxima vez.",
    paso: "quedo",
    tipo: "lista",
    alCliente: false,
    alHandoff: "interno",
  },
  {
    clave: "producto",
    etiqueta: "Producto que se mostró",
    ayuda: "Qué se mostró y para qué reto. Cinco minutos como máximo, y solo en la segunda reunión.",
    paso: "quedo",
    tipo: "texto",
    alCliente: false,
    alHandoff: "interno",
  },
  {
    clave: "apertura",
    etiqueta: "Apertura a la asesoría",
    ayuda: "¿Quiere acompañamiento para crecer, o solo una buena implementación?",
    paso: "quedo",
    tipo: "apertura",
    alCliente: false,
    alHandoff: "interno",
  },
  {
    clave: "siguientePaso",
    etiqueta: "Siguiente paso",
    ayuda: "Qué sigue, con quién y en qué fecha. Se agenda en la misma reunión.",
    paso: "quedo",
    tipo: "siguientePaso",
    alCliente: false,
    alHandoff: "normal",
  },
];

export function definicionDe(clave: ClaveDeCasilla): DefinicionDeCasilla {
  const d = CASILLAS.find((c) => c.clave === clave);
  if (!d) throw new Error(`Casilla desconocida: ${clave}`);
  return d;
}

/**
 * El tipo de cada casilla, a nivel de tipos (lo que deja escribir `ValoresDeCasillas`). Tiene que
 * decir lo mismo que `CASILLAS`: lo sostiene contenido.test.ts.
 */
export const TIPO_DE_CASILLA = {
  contexto: "texto",
  hubspotActual: "texto",
  hipotesis: "lista",
  metas: "metas",
  planes: "lista",
  retos: "retos",
  tiempos: "lista",
  consecuencias: "lista",
  implicaciones: "lista",
  presupuesto: "texto",
  autoridad: "autoridad",
  portal: "lista",
  noExplorado: "lista",
  producto: "texto",
  apertura: "apertura",
  siguientePaso: "siguientePaso",
} as const satisfies Record<ClaveDeCasilla, TipoDeCasilla>;

/** El valor guardado de cada tipo de casilla. */
export interface ValorPorTipo {
  texto: string;
  lista: string[];
  metas: Meta[];
  retos: Reto[];
  autoridad: Persona[];
  siguientePaso: SiguientePaso;
  apertura: Apertura;
}

/** El valor de cada casilla, con su forma. */
export type ValoresDeCasillas = { [K in ClaveDeCasilla]: ValorPorTipo[(typeof TIPO_DE_CASILLA)[K]] };

/** Las casillas de lista se proponen de a UN ítem; las demás, con el valor entero. */
export function esDeLista(tipo: TipoDeCasilla): tipo is "lista" | "metas" | "retos" | "autoridad" {
  return tipo === "lista" || tipo === "metas" || tipo === "retos" || tipo === "autoridad";
}

/** ¿La meta está en cifras? Su objetivo trae un número. */
export function metaEnCifras(m: Pick<Meta, "objetivo">): boolean {
  return /\d/.test(m.objetivo ?? "");
}
