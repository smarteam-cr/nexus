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

/**
 * Una persona en la decisión: quién aprueba, quién decide, quién influye y a quién más afecta. El
 * valor guardado sigue siendo `firma`; en pantalla dice «Aprueba» desde el 2026-10-02 (Elías: «Firma
 * no me parece la mejor palabra»).
 */
export const ROLES_EN_LA_DECISION = ["firma", "decide", "influye", "afectado"] as const;
export type RolEnLaDecision = (typeof ROLES_EN_LA_DECISION)[number];
/** Qué hace cada papel, para elegirlo sin dudar. */
export const QUE_HACE_EL_ROL: Record<RolEnLaDecision, string> = {
  firma: "Da el sí final y aprueba el presupuesto.",
  decide: "Elige la solución y la recomienda.",
  influye: "Opina y pesa en la decisión, sin tomarla.",
  afectado: "Su trabajo cambia con lo que se decida.",
};
export const ETIQUETA_DEL_ROL: Record<RolEnLaDecision, string> = {
  firma: "Aprueba",
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

/**
 * Una objeción del cliente: lo que dijo que lo frena, con sus palabras, de qué clase es y cómo se
 * respondió, si se respondió. Las cuatro primeras clases son las típicas de la guía (guia.ts).
 */
export const CLASES_DE_OBJECION = ["precio", "herramienta", "momento", "propuesta", "confianza", "decisor", "interno", "otra"] as const;
export type ClaseDeObjecion = (typeof CLASES_DE_OBJECION)[number];
export const ETIQUETA_DE_LA_OBJECION: Record<ClaseDeObjecion, string> = {
  precio: "Precio",
  herramienta: "Ya tiene herramienta",
  momento: "No es el momento",
  propuesta: "Pide la propuesta",
  confianza: "Desconfianza",
  decisor: "Lo tiene que consultar",
  interno: "Lo harían ellos mismos",
  otra: "Otra",
};
export interface Objecion {
  texto: string;
  clase: ClaseDeObjecion;
  /** Cómo se respondió en la reunión. Sin respuesta, sigue abierta. */
  respuesta?: string;
}

/**
 * La radiografía de la empresa (account intelligence): lo que el agente investiga en internet al
 * preparar. Cada hito trae el enlace de donde salió: uno que no apareció en la búsqueda no entra.
 */
export const MODELOS_DE_NEGOCIO = ["b2b", "b2c", "ecommerce", "saas", "agencia", "servicios", "manufactura", "distribucion", "retail", "educacion", "banca", "salud", "inmobiliaria", "gobierno", "otro"] as const;
export type ModeloDeNegocio = (typeof MODELOS_DE_NEGOCIO)[number];
export const ETIQUETA_DEL_MODELO: Record<ModeloDeNegocio, string> = {
  b2b: "B2B",
  b2c: "B2C",
  ecommerce: "E-commerce",
  saas: "SaaS",
  agencia: "Agencia",
  servicios: "Servicios profesionales",
  manufactura: "Manufactura",
  distribucion: "Distribución",
  retail: "Retail",
  educacion: "Educación",
  banca: "Banca y finanzas",
  salud: "Salud",
  inmobiliaria: "Inmobiliaria",
  gobierno: "Gobierno",
  otro: "Otro",
};
export interface Hito {
  texto: string;
  /** `AAAA-MM` o `AAAA-MM-DD`, si la fuente la dice. */
  fecha?: string;
  url: string;
}
export interface Radiografia {
  /** Qué hace la empresa, en dos o tres frases. */
  resumen?: string;
  sector?: string;
  modelos?: ModeloDeNegocio[];
  /** Las herramientas que se le ven: su CRM, su tienda, su chat… */
  stack?: string[];
  hitos?: Hito[];
}

/** La estrategia de conexión: por dónde escribirle o llamarle, con qué ángulo y un mensaje de ejemplo. */
export const CANALES_DE_CONEXION = ["email", "llamada", "whatsapp", "linkedin"] as const;
export type CanalDeConexion = (typeof CANALES_DE_CONEXION)[number];
export const ETIQUETA_DEL_CANAL: Record<CanalDeConexion, string> = {
  email: "Correo",
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
};
export interface EstrategiaDeConexion {
  canal: CanalDeConexion;
  /** El ángulo en una o dos frases: por qué le importaría hablar. */
  pitch: string;
  /** Un mensaje de ejemplo, listo para adaptar. */
  mensaje: string;
  /** El llamado a la acción (casi siempre, agendar en el calendario). */
  cta?: string;
}

export const VALORES_DE_APERTURA = ["si", "no", "no_se"] as const;
export interface Apertura {
  valor: (typeof VALORES_DE_APERTURA)[number];
  porQue?: string;
}

// ── Las casillas ──────────────────────────────────────────────────────────────

/** Los tipos de casilla. Las de lista reciben del agente UN ítem por propuesta; las demás, el valor entero. */
export type TipoDeCasilla =
  | "texto"
  | "lista"
  | "metas"
  | "retos"
  | "autoridad"
  | "objeciones"
  | "siguientePaso"
  | "apertura"
  | "radiografia"
  | "conexion";

/**
 * Dónde vive la casilla en el lienzo: en PREPARACIÓN (con quién se habla y cómo conectar, antes de la
 * primera reunión), en el RESUMEN (el marco de calificación —metas, planes, retos, tiempos,
 * presupuesto, quién decide, consecuencias e implicaciones— más las objeciones y las
 * particularidades), o en EXPLORACIÓN (el portal y lo demás que sale de las reuniones).
 */
export type PasoDelLienzo = "preparacion" | "resumen" | "exploracion";

export interface DefinicionDeCasilla {
  clave: ClaveDeCasilla;
  etiqueta: string;
  /** Qué va, en una línea, para quien la llena. */
  ayuda: string;
  /** Para qué sirve y cómo llenarla bien, en dos o tres frases: se lee al abrirla. */
  explicacion?: string;
  /** Un ejemplo de cómo se ve bien escrita. */
  ejemplo?: string;
  paso: PasoDelLienzo;
  tipo: TipoDeCasilla;
  /** Puede entrar a la propuesta (la ve el cliente). */
  alCliente: boolean;
  /** Cómo le llega al CSE en el handoff. */
  alHandoff: "normal" | "interno";
  /**
   * Ya no se muestra ni la propone el agente; lo guardado se sigue leyendo (el CSE lo ve en el
   * traspaso). «Hipótesis» se retiró el 2026-10-01: se repetía con el mapa de la escala y la guía.
   */
  retirada?: true;
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
  "objeciones",
  "particularidades",
  "detonante",
  "radiografia",
  "industria",
  "hipotesisDeValor",
  "estrategiaDeConexion",
] as const;
export type ClaveDeCasilla = (typeof CLAVES_DE_CASILLA)[number];

export const CASILLAS: readonly DefinicionDeCasilla[] = [
  // ── Exploración: antes de la primera reunión ──
  {
    clave: "contexto",
    etiqueta: "Para conectar",
    /* Desde el 2026-10-06 (Elías): solo lo que NO está ya en Identificación. Qué hace la empresa, cómo
       llegó y quién es el contacto se ven arriba; repetirlos acá era leer lo mismo dos veces. */
    ayuda: "Lo importante para abrir la conversación que no está en Identificación: quién lo refirió, una conversación anterior, un tema a evitar.",
    paso: "preparacion",
    tipo: "texto",
    alCliente: false,
    alHandoff: "normal",
  },
  {
    clave: "hubspotActual",
    // La clave sigue diciendo HubSpot (es identidad, la guardan las preventas); el prospecto puede usar otro CRM.
    etiqueta: "Su CRM actualmente",
    ayuda: "Qué CRM usa hoy y cómo: si es HubSpot, sus hubs, ediciones, usuarios, quién lo configuró y cuándo renueva.",
    paso: "preparacion",
    tipo: "texto",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "hipotesis",
    etiqueta: "Hipótesis",
    ayuda: "«Creemos que… porque…». Para confirmar o descartar en la reunión, nunca para afirmar.",
    paso: "exploracion",
    tipo: "lista",
    alCliente: false,
    alHandoff: "interno",
    retirada: true,
  },
  // ── El resumen: adónde quiere llegar y si hay negocio ──
  {
    clave: "metas",
    explicacion: "Adónde quiere llegar el negocio, dicho con números: de dónde parte, adónde quiere llegar y para cuándo. Es lo que después mide el éxito del proyecto y lo que justifica el precio. Si no trae cifra, pregunta «¿cuánto es hoy?» y «¿cuánto sería bueno?».",
    ejemplo: "Pasar de 4 a 7 cierres de cada 10 cotizaciones antes de diciembre.",
    etiqueta: "Metas",
    ayuda: "En cifras: de cuánto a cuánto y para cuándo. Son el criterio de éxito y la base del precio.",
    paso: "resumen",
    tipo: "metas",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "planes",
    explicacion: "Lo que ya hicieron o piensan hacer para llegar a la meta: otra herramienta, contratar, un proceso nuevo. Cuenta qué ya probaron y qué no les funcionó.",
    ejemplo: "Contrataron dos vendedores en marzo y armaron un Excel compartido para el seguimiento.",
    etiqueta: "Planes",
    ayuda: "Lo que ya intentaron o piensan hacer para llegar.",
    paso: "resumen",
    tipo: "lista",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "retos",
    explicacion: "Lo que hoy les impide llegar a la meta, en sus palabras. Suelen salir de las dimensiones más bajas de la escala: atarlos a una dimensión ayuda a priorizar.",
    ejemplo: "Nadie sabe en qué etapa va cada negocio: cada vendedor lleva su propio registro.",
    etiqueta: "Retos",
    ayuda: "Lo que hoy les impide llegar. Salen de las dimensiones bajas de la escala.",
    paso: "resumen",
    tipo: "retos",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "tiempos",
    explicacion: "Las fechas que mandan: para cuándo necesitan el resultado, cuándo deciden y cuándo renuevan lo que tienen. Sin una fecha, la venta se estira.",
    ejemplo: "Renuevan su CRM en febrero y quieren el proceso nuevo andando antes del lanzamiento de abril.",
    etiqueta: "Tiempos",
    ayuda: "Para cuándo lo necesitan y qué fechas mandan (una renovación, un lanzamiento, el cierre del año).",
    paso: "resumen",
    tipo: "lista",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "consecuencias",
    explicacion: "Lo que le cuesta al negocio quedarse como está: clientes que se pierden, horas, dinero. Mejor con su número: es lo que hace urgente la decisión.",
    ejemplo: "Pierden unos 10 negocios al mes porque nadie les da seguimiento a tiempo.",
    etiqueta: "Qué pasa si no actúa",
    ayuda: "Lo que le cuesta quedarse como está, mejor con su número.",
    paso: "resumen",
    tipo: "lista",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "implicaciones",
    explicacion: "Lo que gana el negocio si llega a la meta, en sus palabras: más ventas, más tiempo, crecer sin contratar. Es la otra cara de las consecuencias.",
    ejemplo: "Podrían abrir una sucursal sin sumar personal administrativo.",
    etiqueta: "Qué cambia si lo logra",
    ayuda: "Lo que gana el negocio al llegar a la meta, en sus palabras.",
    paso: "resumen",
    tipo: "lista",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "presupuesto",
    explicacion: "El rango que piensan invertir o contra qué lo van a comparar. Es interno: nunca entra a la propuesta.",
    ejemplo: "Entre 15 y 20 mil dólares; lo comparan con lo que pagan hoy por su CRM.",
    etiqueta: "Presupuesto",
    ayuda: "El rango que tienen, o contra qué lo van a comparar.",
    paso: "resumen",
    tipo: "texto",
    alCliente: false,
    alHandoff: "interno",
  },
  {
    clave: "autoridad",
    explicacion: "Las personas que pesan en la decisión y el papel de cada una: quién aprueba la compra, quién la decide, quién influye y a quién le cambia el trabajo. El cargo solo no dice el papel: pregúntalo.",
    ejemplo: "Laura, gerente general, aprueba; Andrés, gerente comercial, decide; el equipo de ventas es el afectado.",
    etiqueta: "Quién decide",
    ayuda: "Quién aprueba, quién decide, quién influye y a quién más le afecta la decisión.",
    paso: "resumen",
    tipo: "autoridad",
    alCliente: false,
    alHandoff: "interno",
  },
  // ── Exploración: lo que se vio y lo que sigue ──
  {
    clave: "portal",
    etiqueta: "Lo que vimos en el portal",
    ayuda: "Lo que se vio con el portal abierto: lo que está, lo que falta y lo que nadie documentó.",
    paso: "exploracion",
    tipo: "lista",
    alCliente: true,
    alHandoff: "normal",
  },
  {
    clave: "noExplorado",
    etiqueta: "Lo que se dijo y nadie exploró",
    ayuda: "Pistas que el cliente dio y nadie siguió. Cada una: qué dijo y qué preguntar la próxima vez.",
    paso: "exploracion",
    tipo: "lista",
    alCliente: false,
    alHandoff: "interno",
  },
  {
    clave: "producto",
    etiqueta: "Producto que se mostró",
    ayuda: "Qué se mostró y para qué reto. Cinco minutos como máximo, y solo para un reto que el cliente ya nombró.",
    paso: "exploracion",
    tipo: "texto",
    alCliente: false,
    alHandoff: "interno",
  },
  {
    clave: "apertura",
    etiqueta: "Apertura a la asesoría",
    ayuda: "¿Quiere acompañamiento para crecer, o solo una buena implementación?",
    paso: "exploracion",
    tipo: "apertura",
    alCliente: false,
    alHandoff: "interno",
  },
  {
    clave: "siguientePaso",
    etiqueta: "Siguiente paso",
    ayuda: "Qué sigue, con quién y en qué fecha. Se agenda en la misma reunión.",
    paso: "exploracion",
    tipo: "siguientePaso",
    alCliente: false,
    alHandoff: "normal",
  },
  // ── El resumen: lo que sale de cada reunión (pedido de Elías, 2026-10-01) ──
  {
    clave: "objeciones",
    explicacion: "Lo que el cliente dijo que lo frena para comprar, con sus palabras, y cómo se respondió. Una objeción sin responder es lo primero que se retoma en la próxima reunión.",
    ejemplo: "«Ya tenemos Pipedrive»: se respondió que el foco es que funcione lo que ya pagan.",
    etiqueta: "Objeciones",
    ayuda: "Lo que el cliente dijo que lo frena, con sus palabras, y cómo se respondió. Sin respuesta, sigue abierta.",
    paso: "resumen",
    tipo: "objeciones",
    alCliente: false,
    alHandoff: "interno",
  },
  {
    clave: "particularidades",
    explicacion: "Lo propio de esta cuenta que cambia cómo venderle o implementar: una restricción, un contrato vigente, una política interna, una fecha que manda o alguien clave.",
    ejemplo: "Toda compra de más de 5 mil dólares la aprueba la casa matriz en México.",
    etiqueta: "Particularidades",
    ayuda: "Lo propio de esta cuenta que cambia cómo venderle o implementar: una restricción, un contrato vigente, una política, una fecha que manda, alguien clave.",
    paso: "resumen",
    tipo: "lista",
    alCliente: false,
    alHandoff: "interno",
  },
  // ── Preparación: antes de escribirle o llamarle (pedido de Elías, 2026-10-02) ──
  {
    clave: "detonante",
    etiqueta: "Por qué ahora",
    ayuda: "Qué hizo o qué le pasó que vuelve oportuno hablar ahora: el test, una visita, un cambio en la empresa.",
    explicacion:
      "La razón para escribirle hoy y no dentro de tres meses. Sale de lo que hizo (llenó el diagnóstico, pidió una demo, volvió al sitio) o de lo que le pasa a la empresa (crece, contrata, cambia de herramienta). Es la primera frase del mensaje.",
    ejemplo: "Llenó el diagnóstico de Ventas el 23 de septiembre: salió Deficiente en Datos y es la nueva gerente comercial.",
    paso: "preparacion",
    tipo: "texto",
    alCliente: false,
    alHandoff: "interno",
  },
  {
    clave: "radiografia",
    etiqueta: "Radiografía de la empresa",
    ayuda: "Qué hace, su sector, cómo vende, las herramientas que se le ven y lo que le pasó hace poco.",
    explicacion:
      "Lo que el agente encontró en internet sobre la empresa, con el enlace de cada hito. Sirve para no llegar en blanco y para hablar de algo suyo en la primera frase.",
    paso: "preparacion",
    tipo: "radiografia",
    alCliente: false,
    alHandoff: "normal",
  },
  {
    clave: "industria",
    etiqueta: "Su industria",
    ayuda: "Cómo se mueve su industria hoy y qué suele dolerle a una empresa como esta, en pocas líneas.",
    explicacion:
      "Lo que el agente investigó en internet sobre la industria de la empresa: hacia dónde va y los retos típicos de venta, marketing o servicio en su sector. Sirve para hablar de su mundo, no del nuestro.",
    paso: "preparacion",
    tipo: "texto",
    alCliente: false,
    alHandoff: "normal",
  },
  {
    clave: "hipotesisDeValor",
    etiqueta: "Hipótesis de valor",
    ayuda: "Lo que probablemente le duele y cómo lo resolvemos, en una línea por idea, con de dónde sale.",
    explicacion:
      "La interpretación comercial antes de escribir o llamar: cruza los dolores típicos de su industria con lo que dejó el diagnóstico, lo que se ve en HubSpot y tus notas. Cada idea dice de dónde sale. Es una apuesta para confirmar en la reunión, nunca algo para afirmarle al cliente.",
    ejemplo: "Pierden negocios por seguimiento tardío: el CRM solo guarda contactos · De: el diagnóstico y HubSpot",
    paso: "preparacion",
    tipo: "lista",
    alCliente: false,
    alHandoff: "interno",
  },
  {
    clave: "estrategiaDeConexion",
    etiqueta: "Estrategia de conexión",
    ayuda: "Por dónde contactarlo, con qué ángulo y un mensaje de ejemplo que cierre con una invitación a agendar.",
    explicacion:
      "Cómo abrir la conversación: el canal, el ángulo y un primer mensaje corto que hable de algo suyo y cierre invitando a agendar en tu calendario. Si ya agendó la reunión, no hace falta.",
    paso: "preparacion",
    tipo: "conexion",
    alCliente: false,
    alHandoff: "interno",
  },
];

/** Las casillas del resumen, en el orden del marco: metas, planes, retos y tiempos; presupuesto y quién decide; consecuencias e implicaciones. */
export const CASILLAS_DEL_RESUMEN = [
  "metas",
  "planes",
  "retos",
  "tiempos",
  "presupuesto",
  "autoridad",
  "consecuencias",
  "implicaciones",
] as const satisfies readonly ClaveDeCasilla[];

/** Las del resumen que van debajo de las tarjetas del marco: lo que sale de cada reunión. */
export const CASILLAS_DE_LAS_REUNIONES = ["objeciones", "particularidades"] as const satisfies readonly ClaveDeCasilla[];

/** Las que el agente propone y el lienzo muestra: todas menos las retiradas. */
export const CASILLAS_VIGENTES: readonly DefinicionDeCasilla[] = CASILLAS.filter((c) => !c.retirada);

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
  objeciones: "objeciones",
  particularidades: "lista",
  detonante: "texto",
  radiografia: "radiografia",
  industria: "texto",
  hipotesisDeValor: "lista",
  estrategiaDeConexion: "conexion",
} as const satisfies Record<ClaveDeCasilla, TipoDeCasilla>;

/** El valor guardado de cada tipo de casilla. */
export interface ValorPorTipo {
  texto: string;
  lista: string[];
  metas: Meta[];
  retos: Reto[];
  autoridad: Persona[];
  objeciones: Objecion[];
  siguientePaso: SiguientePaso;
  apertura: Apertura;
  radiografia: Radiografia;
  conexion: EstrategiaDeConexion;
}

/** El valor de cada casilla, con su forma. */
export type ValoresDeCasillas = { [K in ClaveDeCasilla]: ValorPorTipo[(typeof TIPO_DE_CASILLA)[K]] };

/** Las casillas de lista se proponen de a UN ítem; las demás, con el valor entero. */
export function esDeLista(tipo: TipoDeCasilla): tipo is "lista" | "metas" | "retos" | "autoridad" | "objeciones" {
  return tipo === "lista" || tipo === "metas" || tipo === "retos" || tipo === "autoridad" || tipo === "objeciones";
}

/**
 * Cuántos ítems admite cada casilla de lista. Lo usan el esquema (esquemas.ts) y la operación que
 * agrega un ítem (contenido.ts): si solo lo supiera el esquema, «Usar» agregaría el ítem 21 y la
 * lectura descartaría la lista ENTERA.
 */
export const TOPE_DE_LA_LISTA: Record<"lista" | "metas" | "retos" | "autoridad" | "objeciones", number> = {
  lista: 40,
  metas: 20,
  retos: 30,
  autoridad: 30,
  objeciones: 30,
};

/** ¿La meta está en cifras? Su objetivo trae un número. */
export function metaEnCifras(m: Pick<Meta, "objetivo">): boolean {
  return /\d/.test(m.objetivo ?? "");
}

// ── De dónde sale una hipótesis de valor (Elías, 2026-10-06) ─────────────────

/** Lo que separa la idea de su origen en el texto guardado: «La idea · De: HubSpot y tus notas». */
const MARCA_DEL_ORIGEN = " · De: ";

/** De dónde sale una fuente del agente, en palabras: por el prefijo de su id (lib/exploraciones/fuentes.ts). */
export function origenDeLaFuente(id: string): string {
  if (id === "N0") return "tus notas";
  if (id === "W1") return "la investigación de la empresa";
  if (id === "W2") return "la investigación de su industria";
  if (id === "W0") return "su sitio web";
  if (/^T\d/.test(id)) return "el diagnóstico";
  if (/^[SM]\d/.test(id)) return "una reunión";
  return "HubSpot";
}

/**
 * La hipótesis con su origen al final, armado desde las fuentes que declaró el agente (no lo escribe
 * el modelo). Sin «Creemos que» adelante: la sección ya dice que son hipótesis.
 */
export function conSuOrigen(texto: string, idsDeFuentes: readonly string[]): string {
  const idea = separarOrigen(texto).idea.replace(/^creemos que\s+/i, "");
  const limpia = idea.charAt(0).toUpperCase() + idea.slice(1);
  const origenes = [...new Set(idsDeFuentes.map(origenDeLaFuente))].slice(0, 3);
  if (origenes.length === 0) return limpia;
  const dicho = origenes.length === 1 ? origenes[0] : `${origenes.slice(0, -1).join(", ")} y ${origenes[origenes.length - 1]}`;
  return `${limpia}${MARCA_DEL_ORIGEN}${dicho}`;
}

/** La idea y su origen, para pintarlos por separado. Un texto sin la marca es todo idea. */
export function separarOrigen(texto: string): { idea: string; origen: string | null } {
  const i = texto.lastIndexOf(MARCA_DEL_ORIGEN);
  if (i < 0) return { idea: texto.trim(), origen: null };
  return { idea: texto.slice(0, i).trim(), origen: texto.slice(i + MARCA_DEL_ORIGEN.length).trim() || null };
}
