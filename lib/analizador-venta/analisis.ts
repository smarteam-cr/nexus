/**
 * lib/analizador-venta/analisis.ts — QUÉ DEVUELVE EL ANÁLISIS DE UNA REUNIÓN DE VENTA Y CÓMO SE VERIFICA (S3,
 * 2026-10-25). PURO y client-safe.
 *
 * La regla del plan: **cada juicio trae su cita textual de la transcripción; sin cita, no hay juicio.** El modelo cita
 * por TURNO (el número de cada intervención de la conversación numerada) y copia el pedazo dicho; el código comprueba que
 * ese pedazo esté de verdad en ese turno (o, si se equivocó de número, en algún turno), sin mirar tildes, mayúsculas ni
 * signos, y el turno y el hablante salen de la TRANSCRIPCIÓN, nunca del modelo. Un juicio cuyas citas no aparecen se
 * descarta y se cuenta.
 *
 * La única excepción son los juicios POR AUSENCIA («no se preguntó por el decisor», «no quedó siguiente paso»): lo que no
 * se dijo no se puede citar. Van marcados como tales, para que quien lee sepa que Nexus no encontró algo y no que lo vio.
 *
 * Quién habló (el punto 3) no lo dice el modelo: lo calcula lib/analizador-venta/quien-hablo.ts.
 *
 * El 29 oct (Elías, con la reunión de Camosa de ese día):
 *   · la cita se busca palabra por palabra y no como un pedazo exacto: el modelo la copia «limpia» (sin los «eh», los
 *     «este» ni las palabras repetidas del habla, a veces uniendo dos turnos seguidos de la misma persona) y la búsqueda
 *     exacta descartaba juicios ciertos; en Camosa se llevó todo lo que se exploró. Lo que se muestra sigue siendo el
 *     pedazo de la TRANSCRIPCIÓN, con sus muletillas;
 *   · lo que salió bien (`bien`) y lo que hay que mejorar (`recomendaciones`) llevan su cita SIEMPRE: sin evidencia, no
 *     se dice;
 *   · dos puntos nuevos para aterrizar y expandir: si se exploró a fondo el dolor del área (`dolor`) y si ya hay base
 *     para ofrecer un caso de uso (`caso_de_uso`);
 *   · el foco de la sesión (`enfoque`): hacia qué áreas fueron las preguntas. La exploración se juzga solo ahí; del resto
 *     queda el nombre del área en una línea.
 *
 * El 8 nov (Elías, con Centauro: «que el vendedor lo lea en dos minutos y sepa qué tan buena fue su exploración y qué le
 * falta»), sin secciones nuevas, más certero:
 *   · lo que apareció FUERA del objetivo de la sesión no se descarta (`fueraDelObjetivo`, con cita del cliente);
 *   · los números del cliente en una tabla corta (`numeros`): la meta, lo que pasa hoy y la pregunta de lo que falta. La
 *     cifra tiene que estar en la cita MÁS NUEVA de su celda: si el cliente la corrigió, vale la corregida;
 *   · tres estados por dimensión (no se tocó · se mencionó sin profundizar · se exploró): un «sin explorar» que trae una
 *     cita que está pasa a «se mencionó» (`tocado`);
 *   · qué falta para decidir (`decision`): quién decide, para cuándo, cuánto invertir y qué pasa si no hacen nada, sin
 *     marcar como faltante lo que ya se sabía (de la preventa o de una sesión anterior de la MISMA empresa);
 *   · los próximos pasos verificados (`pasos`): el día de la semana tiene que estar en lo dicho alrededor de la cita, y de
 *     dos versiones del mismo paso queda la más nueva; reemplazan la lectura del siguiente paso;
 *   · «Para mejorar» trae qué decir la próxima vez (`decir`);
 *   · las preguntas por funciones de la herramienta, para el demo (`demo`), con quién preguntó (el de la transcripción).
 */
import { ETAPAS, type EtapaDelProceso } from "./criterio";

/** Los puntos que juzga el modelo (el 3, quién habló, y las recomendaciones van aparte). */
export const PUNTOS_JUZGADOS = ["consultiva", "temas", "guia", "escala", "posicionamiento", "exploracion", "posicion", "siguiente_paso", "etapa", "dolor", "caso_de_uso", "resultado"] as const;
export type PuntoJuzgado = (typeof PUNTOS_JUZGADOS)[number];

/** Los valores de cada punto. El primero de la lista es el mejor. */
export const VALORES: Record<PuntoJuzgado, readonly string[]> = {
  consultiva: ["mucho", "en_parte", "poco"],
  temas: ["cliente", "mezcla", "producto"],
  guia: ["si", "en_parte", "no", "sin_guia"],
  escala: ["si", "no", "sin_escala"],
  posicionamiento: ["si", "en_parte", "no", "sin_posicionamiento"],
  exploracion: ["explorado", "tocado", "sin_explorar"],
  posicion: ["asesor", "mixto", "vendedor_de_licencias"],
  siguiente_paso: ["con_fecha_y_duenio", "sin_fecha", "sin_duenio", "ninguno"],
  etapa: ["se_hizo", "en_parte", "se_salto"],
  dolor: ["a_fondo", "en_parte", "sin_explorar"],
  caso_de_uso: ["hay_base", "falta", "sin_base"],
  // 2026-11-06: ¿se averiguó el resultado que busca el cliente? (de dónde a dónde, con qué número, para cuándo).
  resultado: ["si", "en_parte", "no"],
};

/** Los valores que dicen que algo NO pasó: no se pueden citar. */
const POR_AUSENCIA: Readonly<Record<PuntoJuzgado, readonly string[]>> = {
  consultiva: [],
  temas: [],
  guia: ["no", "sin_guia"],
  escala: ["no", "sin_escala"],
  posicionamiento: ["no", "sin_posicionamiento"],
  exploracion: ["sin_explorar"],
  posicion: [],
  siguiente_paso: ["ninguno"],
  etapa: ["se_salto"],
  dolor: ["sin_explorar"],
  caso_de_uso: ["sin_base"],
  resultado: ["no"],
};

/** Cómo se dice cada valor en la pantalla. */
export const TEXTO_DEL_VALOR: Record<string, string> = {
  mucho: "Muy consultiva",
  en_parte: "En parte",
  poco: "Poco consultiva",
  cliente: "Del cliente",
  mezcla: "Mezcla",
  producto: "De producto y precio",
  si: "Sí",
  no: "No",
  sin_guia: "Sin guía",
  sin_escala: "Sin escala",
  sin_posicionamiento: "Sin posicionamiento escrito",
  explorado: "Explorado",
  // 2026-11-08: los tres estados de una dimensión se dicen igual en toda la pantalla.
  tocado: "Mencionado sin profundizar",
  sin_explorar: "Sin explorar",
  asesor: "Como asesor",
  mixto: "Mixto",
  vendedor_de_licencias: "Como vendedor de licencias",
  con_fecha_y_duenio: "Con fecha y dueño",
  sin_fecha: "Sin fecha",
  sin_duenio: "Sin dueño",
  ninguno: "Ninguno",
  se_hizo: "Se hizo",
  se_salto: "Se saltó",
  a_fondo: "A fondo",
  hay_base: "Hay base",
  falta: "Falta",
  sin_base: "Sin base",
};

/** Un turno de la conversación numerada que se le pasa al modelo. */
export interface TurnoNumerado {
  n: number;
  hablante: string;
  texto: string;
}

/** Una cita ya verificada: el texto y el hablante salen de la transcripción. */
export interface Cita {
  turno: number;
  hablante: string;
  texto: string;
}

export interface Juicio {
  punto: PuntoJuzgado;
  etapa: EtapaDelProceso | null;
  /** Solo exploracion: el nombre de la dimensión (sin el área). */
  dimension: string | null;
  /** Solo exploracion: el área de la dimensión, si se sabe (los análisis de antes del 29 oct no la traen). */
  area?: string | null;
  /** Solo caso_de_uso: el caso ya elegido en la preventa al que apunta, si apunta a uno. */
  caso?: string | null;
  valor: string | null;
  lectura: string;
  citas: Cita[];
  /** Dice que algo NO pasó: no trae cita. */
  porAusencia: boolean;
}

/** Lo que salió bien o lo que hay que mejorar: una frase y la cita del momento que la respalda. */
export interface Observacion {
  texto: string;
  citas: Cita[];
  /** Solo «Para mejorar» (2026-11-08): qué decir la próxima vez, en una frase lista para usar. */
  decir?: string;
}
export type Recomendacion = Observacion;

/* ── Lo del 8 nov: números, decisión, próximos pasos y demo ─────────────────────── */

/** Los números que sirven para justificar una propuesta (Elías, 8 nov). Ninguno más. */
export const TEMAS_DE_NUMEROS = ["volumen", "conversion", "ticket", "costo_del_problema", "frecuencia", "clientes_perdidos"] as const;
export type TemaDeNumeros = (typeof TEMAS_DE_NUMEROS)[number];
export const TEXTO_DEL_TEMA: Record<TemaDeNumeros, string> = {
  volumen: "Volumen",
  conversion: "Conversión",
  ticket: "Ticket",
  costo_del_problema: "Costo del problema",
  frecuencia: "Frecuencia",
  clientes_perdidos: "Clientes perdidos",
};

/** Una cifra que dijo el cliente, con la cita donde la dijo (la más nueva, si la corrigió). */
export interface CifraDicha {
  texto: string;
  cita: Cita;
}

/** Una fila de la tabla de números: la meta, lo que pasa hoy y lo que falta saber (como pregunta). */
export interface FilaDeNumeros {
  tema: TemaDeNumeros;
  /** De qué es el número, corto: «Cierres por mes». */
  que: string;
  meta: CifraDicha | null;
  realidad: CifraDicha | null;
  /** Lo que falta saber, como pregunta lista para la próxima sesión. */
  falta: string | null;
}

/** Los huecos de decisión: sin ellos no hay propuesta que se apruebe. */
export const HUECOS_DE_DECISION = ["quien_decide", "para_cuando", "cuanto_invertir", "si_no_hacen_nada"] as const;
export type HuecoDeDecision = (typeof HUECOS_DE_DECISION)[number];
export const TEXTO_DEL_HUECO: Record<HuecoDeDecision, string> = {
  quien_decide: "quién decide",
  para_cuando: "para cuándo lo necesitan",
  cuanto_invertir: "cuánto pueden invertir",
  si_no_hacen_nada: "qué pasa si no hacen nada",
};
/** La pregunta de base de cada hueco (las de la arquitectura de la venta, lib/exploraciones/marco.ts). */
export const PREGUNTA_DEL_HUECO: Record<HuecoDeDecision, string> = {
  quien_decide: "Además de ti, ¿quién tiene que estar de acuerdo para avanzar? ¿Quién da el visto bueno final?",
  para_cuando: "¿Para cuándo lo necesitan? ¿Hay alguna fecha que mande?",
  cuanto_invertir: "¿Tienen un rango de inversión pensado para esto, o contra qué lo van a comparar?",
  si_no_hacen_nada: "Si esto sigue igual seis meses más, ¿qué pasa? ¿Cuánto les cuesta?",
};

export interface Decision {
  hueco: HuecoDeDecision;
  seSabe: boolean;
  /** Lo que se sabe, o la pregunta que falta hacer. */
  texto: string;
  cita: Cita | null;
  /** Se sabía de antes (la preventa o una sesión anterior de la empresa): no es de esta sesión. */
  deAntes: boolean;
}

/** Un próximo paso acordado, como quedó AL FINAL de la conversación. */
export interface PasoAcordado {
  que: string;
  cuando: string | null;
  quien: string | null;
  cita: Cita;
}

/** Una función de la herramienta por la que preguntó el cliente: para el demo, no para responder en vivo. */
export interface PreguntaDelDemo {
  pregunta: string;
  /** Quién preguntó: el hablante de la cita (de la transcripción, nunca del modelo). */
  quien: string;
  cita: Cita;
}

/** Hacia qué áreas fueron las preguntas de la sesión. */
export interface EnfoqueDeLaSesion {
  /** Las áreas (o el equipo) en las que se juzga qué se exploró. */
  areas: string[];
  /** Las áreas que se esperaban y a las que la conversación no fue: una línea en la pantalla. */
  sinTocar: string[];
  /** Con quién se habló y hacia dónde fueron las preguntas, en una frase. */
  lectura: string;
}

export interface ResultadoDelAnalisis {
  resumen: string;
  juicios: Juicio[];
  /** Lo que salió bien, cada cosa con su cita. Los análisis de antes del 29 oct no lo traen (vacío). */
  bien: Observacion[];
  /** «Para mejorar». */
  recomendaciones: Recomendacion[];
  /** null en los análisis de antes del 29 oct. */
  enfoque: EnfoqueDeLaSesion | null;
  /* Desde el 2026-11-08; los análisis de antes no los traen (se leen como ausentes, no como vacíos). */
  /** Lo importante que salió fuera del objetivo de la sesión, con la cita del cliente. */
  fueraDelObjetivo?: Observacion[];
  numeros?: FilaDeNumeros[];
  /** Siempre los cuatro huecos, en el orden de `HUECOS_DE_DECISION`. */
  decision?: Decision[];
  pasos?: PasoAcordado[];
  demo?: PreguntaDelDemo[];
}

/* ── La herramienta que llena el modelo ─────────────────────────────────────────── */

const CITAS = {
  type: "array",
  description: "Las citas que respaldan lo dicho: el número del turno y el pedazo dicho, copiado tal cual (entre 5 y 25 palabras). Una basta; dos como mucho.",
  items: {
    type: "object",
    properties: { turno: { type: "integer" }, texto: { type: "string" } },
    required: ["turno", "texto"],
  },
} as const;

/** Una cifra con su cita (una o varias: si se corrigió, la corrección también). */
const CIFRA = {
  type: "object",
  properties: { texto: { type: "string", description: "La cifra CON DÍGITOS y su unidad, como la dijo el cliente: «25 cierres al mes», «25 mil dólares». Solo lo que dijo el cliente, no lo que preguntó el vendedor." }, citas: CITAS },
  required: ["texto", "citas"],
} as const;

/** Los errores comunes de una exploración (Elías, 8 nov): «Para mejorar» elige los más importantes de acá. */
export const ERRORES_DE_EXPLORACION = [
  "funciones_antes_del_dolor",
  "prometer_sin_dimensionar",
  "opinar_de_un_numero_sin_la_meta",
  "preguntas_con_la_respuesta",
  "cerrar_sin_validar_prioridades",
  "smarteam_sin_rol",
  "otro",
] as const;
export const TEXTO_DEL_ERROR: Record<(typeof ERRORES_DE_EXPLORACION)[number], string> = {
  funciones_antes_del_dolor: "explicar funciones de la herramienta sin que antes se haya hablado del dolor",
  prometer_sin_dimensionar: "prometer que todo se puede sin haberlo dimensionado",
  opinar_de_un_numero_sin_la_meta: "opinar sobre un número del cliente antes de conocer su meta",
  preguntas_con_la_respuesta: "hacer preguntas que ya traen la respuesta",
  cerrar_sin_validar_prioridades: "cerrar sin resumir y validar con el cliente cuáles son sus prioridades",
  smarteam_sin_rol: "que alguien del equipo de Smarteam esté en la reunión sin un rol",
  otro: "otro error, solo si es más importante que los de la lista",
};

const OBSERVACIONES = (description: string) =>
  ({
    type: "array",
    description,
    items: { type: "object", properties: { texto: { type: "string" }, citas: CITAS }, required: ["texto", "citas"] },
  }) as const;

/** El `input_schema` de la herramienta `registrar_analisis` (la API arma el objeto: no hay JSON que escapar). */
export const HERRAMIENTA_DEL_ANALISIS = {
  name: "registrar_analisis",
  description: "Registra el análisis de la reunión de venta, cada juicio con sus citas de la conversación.",
  input_schema: {
    type: "object",
    properties: {
      resumen: {
        type: "string",
        description:
          "Dos o tres frases, en tuteo, hasta 60 palabras en total, en tono neutro y sin puntaje: qué tan buena fue la exploración; si ya se exploró a fondo el dolor (qué resultado necesita el cliente y por qué no lo tiene hoy), también el que apareció fuera del objetivo; y si ya hay base para ofrecer un caso de uso. No enumeres los números que faltan ni los huecos de decisión: van en «numeros» y «decision».",
      },
      enfoque: {
        type: "object",
        description: "Hacia qué áreas fue la conversación: con quién del cliente se habló y hacia dónde fueron las preguntas.",
        properties: {
          areas: { type: "array", items: { type: "string" }, description: "Los nombres de las áreas de la lista «lo que se esperaba explorar» a las que fueron las preguntas." },
          lectura: { type: "string", description: "Una frase: con quién se habló (nombre y rol, si se dijo) y hacia qué área fueron las preguntas." },
        },
        required: ["areas", "lectura"],
      },
      juicios: {
        type: "array",
        items: {
          type: "object",
          properties: {
            punto: { type: "string", enum: [...PUNTOS_JUZGADOS] },
            etapa: { type: "string", enum: [...ETAPAS], description: "Solo si punto = etapa." },
            dimension: { type: "string", description: "Solo si punto = exploracion: la dimensión TAL COMO viene en la lista, con su área entre paréntesis." },
            caso: { type: "string", description: "Solo si punto = caso_de_uso: el título de uno de los casos de uso ya elegidos en la preventa, si apunta a uno. Si no hay casos elegidos, vacío." },
            valor: { type: "string", description: "Uno de los valores permitidos para ese punto." },
            lectura: { type: "string", description: "Una frase corta (hasta 25 palabras) en tuteo, concreta y neutra." },
            citas: CITAS,
          },
          required: ["punto", "valor", "lectura", "citas"],
        },
      },
      bien: OBSERVACIONES("Lo que salió bien: dos o tres, las más importantes, en tuteo («Redirigiste…»), una frase cada una con la cita del momento. Sin cita no va. No repitas fechas ni horas de los próximos pasos: van en «pasos»."),
      recomendaciones: {
        type: "array",
        description:
          "Para mejorar: dos o tres, los errores MÁS importantes de esta sesión, elegidos de la lista de errores comunes de la exploración. Cada uno con la cita del momento y qué decir la próxima vez. Sin cita no va.",
        items: {
          type: "object",
          properties: {
            error: { type: "string", enum: [...ERRORES_DE_EXPLORACION], description: "Cuál de los errores comunes es." },
            texto: { type: "string", description: "Una frase (hasta 30 palabras), en tuteo: qué pasó en este momento de la reunión." },
            decir: { type: "string", description: "Qué decir la próxima vez, en una frase lista para usar, en tuteo." },
            citas: CITAS,
          },
          required: ["error", "texto", "decir", "citas"],
        },
      },
      fuera_del_objetivo: OBSERVACIONES(
        "Lo importante que apareció FUERA del objetivo de la sesión (un dolor fuerte, una consecuencia de negocio, una urgencia): hasta dos, cada uno en una frase corta con la cita del CLIENTE. Lo más valioso de una exploración suele salir fuera del guion: no lo descartes por no encajar con el objetivo. Si no hubo, vacío.",
      ),
      numeros: {
        type: "array",
        description:
          "Los números del cliente que sirven para justificar una propuesta, SOLO de estos temas: volumen, conversión, ticket, costo de un problema, frecuencia y clientes perdidos. Una fila por número, hasta seis. Si el cliente corrigió una cifra, usa la corregida y cita la corrección.",
        items: {
          type: "object",
          properties: {
            tema: { type: "string", enum: [...TEMAS_DE_NUMEROS] },
            que: { type: "string", description: "De qué es el número, en pocas palabras: «Cierres por mes»." },
            meta: { ...CIFRA, description: "Lo que el cliente dijo como meta, con su cifra y su cita. Si no lo dijo, omítelo." },
            realidad: { ...CIFRA, description: "Lo que pasa hoy, con su cifra y su cita. Si no lo dijo, omítelo." },
            falta: { type: "string", description: "Lo que falta saber de este número, como UNA pregunta lista para la próxima sesión. Vacío si no falta nada." },
          },
          required: ["tema", "que"],
        },
      },
      decision: {
        type: "array",
        description:
          "Los cuatro huecos de decisión (quien_decide, para_cuando, cuanto_invertir, si_no_hacen_nada), uno por hueco. se_sabe: con la cita de esta reunión, o sin cita si ya se sabía de antes (está en «lo que ya se sabe para decidir»). falta: el texto es la pregunta para la próxima sesión.",
        items: {
          type: "object",
          properties: {
            hueco: { type: "string", enum: [...HUECOS_DE_DECISION] },
            estado: { type: "string", enum: ["se_sabe", "falta"] },
            texto: { type: "string", description: "Lo que se sabe, en una frase; o la pregunta que falta hacer." },
            citas: CITAS,
          },
          required: ["hueco", "estado", "texto", "citas"],
        },
      },
      pasos: {
        type: "array",
        description:
          "Los próximos pasos como quedaron AL FINAL de la conversación: lo último que se acordó manda sobre lo que se propuso antes. Incluye cada sesión agendada. Cita el turno donde quedó acordado (el día o la hora).",
        items: {
          type: "object",
          properties: {
            tema: { type: "string", description: "Qué paso es, corto y estable: «Sesión con Marketing», «Brief por correo». Dos versiones del mismo paso llevan el mismo tema." },
            que: { type: "string", description: "Qué se hace, en una frase." },
            cuando: { type: "string", description: "Cuándo, con las palabras de la conversación («miércoles a las 2 de la tarde»). Sin fechas calculadas. Vacío si no se dijo." },
            quien: { type: "string", description: "Con quién, solo el nombre del cliente («Catalina»). Vacío si no se dijo." },
            citas: CITAS,
          },
          required: ["tema", "que", "citas"],
        },
      },
      demo: {
        type: "array",
        description:
          "Las funciones de la herramienta por las que preguntó el CLIENTE («¿se puede…?», «¿HubSpot hace…?»): para llevarlas al demo en lugar de responderlas en vivo. Una por pregunta, hasta cinco, con la cita de la pregunta. Si no preguntó, vacío.",
        items: {
          type: "object",
          properties: { pregunta: { type: "string", description: "La función por la que preguntó, en pocas palabras." }, citas: CITAS },
          required: ["pregunta", "citas"],
        },
      },
    },
    required: ["resumen", "enfoque", "juicios", "bien", "recomendaciones", "fuera_del_objetivo", "numeros", "decision", "pasos", "demo"],
  },
} as const;

/* ── La verificación ─────────────────────────────────────────────────────────── */

/** Para comparar una cita con lo dicho: sin tildes, sin mayúsculas, sin signos ni comillas, espacios simples. */
export function paraComparar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[“”«»"'‘’.,;:¿?¡!…()\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Una cita más corta que esto no prueba nada («sí», «claro»). */
const MIN_LETRAS_DE_UNA_CITA = 12;
/** De las palabras de la cita, cuántas tienen que estar en lo dicho, en orden (el modelo a veces corrige una). */
const PROPORCION_MINIMA = 0.85;
/**
 * De las palabras de la cita, cuántas tienen que estar PEGADAS a la anterior en lo dicho (a lo sumo una muletilla en
 * medio): una cita es un pedazo seguido con algún hueco, no palabras sueltas juntadas de aquí y de allá.
 */
const PROPORCION_PEGADA = 0.7;
/** Cuántas palabras de lo dicho se puede saltar la cita entre una y la siguiente (muletillas, una frase de relleno). */
const MAX_SALTO = 12;
/**
 * Las palabras que cambian el sentido: la cita no puede saltárselas ni lo dicho puede tenerlas de más dentro del tramo
 * («no está aprobado» no se respalda con «está aprobado»; «usan poco el CRM» no se respalda con «usan el CRM»). Los
 * números van aparte: tienen que ser idénticos.
 */
const NEGACIONES = new Set(["no", "nunca", "sin", "ni", "tampoco", "nada", "jamas", "ningun", "ninguna", "ninguno", "nadie", "poco", "poca", "pocos", "pocas", "casi", "apenas", "menos"]);

/** Los números chicos que la transcripción escribe en letras: «dos vendedores» y «2 vendedores» son lo mismo. */
const NUMEROS: Readonly<Record<string, string>> = {
  dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9", diez: "10",
  once: "11", doce: "12", quince: "15", veinte: "20", treinta: "30", cuarenta: "40", cincuenta: "50", cien: "100",
};

interface Palabra {
  norm: string;
  inicio: number;
  fin: number;
  /** Un «no» de muletilla («lo que necesitamos, ¿no?, es…»), un «sin embargo», o un «no, no» repetido: no niega. */
  relleno?: boolean;
}

/** Las palabras de un texto. «2.000» y «2,000» son «2000»; «dos» es «2». */
function palabras(texto: string): Palabra[] {
  const ps: Palabra[] = [...texto.matchAll(/\d{1,3}(?:[.,]\d{3})+(?![\d])|[\p{L}\p{N}]+/gu)].map((m) => {
    const norm = paraComparar(m[0]).replace(/[^\p{L}\p{N}]/gu, "");
    return { norm: NUMEROS[norm] ?? norm, inicio: m.index!, fin: m.index! + m[0].length };
  });
  ps.forEach((x, i) => {
    const despues = texto.slice(x.fin, x.fin + 2);
    if (x.norm === "no" && /^\s?\?/.test(despues)) x.relleno = true;
    if (x.norm === "sin" && ps[i + 1]?.norm === "embargo") x.relleno = true;
    // 2026-11-08 (Centauro): el «no sé» de muletilla, entre comas («si se les olvida calendar, no sé, colocar…»), no niega.
    const se = ps[i + 1];
    // Con la tilde («sé»): «la verdad, no se, usa mucho el CRM» sí niega (lo cazó la revisión).
    if (x.norm === "no" && se?.norm === "se" && texto.slice(se.inicio, se.fin).toLowerCase() === "sé" && /,\s*$/.test(texto.slice(Math.max(0, x.inicio - 2), x.inicio)) && /^\s*,/.test(texto.slice(se.fin, se.fin + 2))) x.relleno = true;
    // La palabra repetida («no, no»).
    if (NEGACIONES.has(x.norm) && ps[i + 1]?.norm === x.norm) x.relleno = true;
    // Desde el 8 nov, el número repetido («Digamos que 25 25 la mitad»): la repetición, no el número.
    // Pero no si lleva un multiplicador: en «25, 25 mil» el segundo corrige al primero.
    if (conNumero(x.norm) && ps[i - 1]?.norm === x.norm && !MULTIPLICADORES.has(ps[i + 1]?.norm ?? "")) x.relleno = true;
  });
  return ps;
}

const conNumero = (x: string) => /\d/.test(x);
/** Una palabra que, si falta o sobra, cambia lo que se dijo. */
const cambiaElSentido = (x: Palabra) => !x.relleno && (NEGACIONES.has(x.norm) || conNumero(x.norm));

/** La misma palabra, o una letra distinta en una palabra larga («mida» por «mide»). Un número, idéntico. */
function igual(a: string, b: string): boolean {
  if (a === b) return true;
  if (conNumero(a) || conNumero(b)) return false;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  // Distancia de edición ≤ 1.
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const resto = (x: string, y: string) => x === y;
  return resto(a.slice(i + 1), b.slice(i + 1)) || resto(a.slice(i), b.slice(i + 1)) || resto(a.slice(i + 1), b.slice(i));
}

/**
 * Dónde está la cita en lo dicho, palabra por palabra: casi todas sus palabras, en orden, casi todas pegadas a la
 * anterior, sin saltarse mucho entre una y otra, en un tramo no mucho más largo que la cita, y sin que falte ni sobre una
 * negación o un número. Devuelve el tramo (primera y última palabra de lo dicho) o null.
 */
function ubicar(cita: readonly Palabra[], dicho: readonly Palabra[]): { desde: number; hasta: number } | null {
  const k = cita.length;
  if (!k) return null;
  const minimo = Math.max(3, Math.ceil(k * PROPORCION_MINIMA));
  const minimoPegadas = Math.max(3, Math.ceil(k * PROPORCION_PEGADA));
  const exigidas = cita.map(cambiaElSentido);
  let mejor: { desde: number; hasta: number; aciertos: number; pegadas: number } | null = null;
  // Se puede empezar por la primera, la segunda o la tercera palabra de la cita (las que faltan cuentan como no halladas).
  for (let i0 = 0; i0 < Math.min(3, k); i0++) {
    if (exigidas.slice(0, i0).some(Boolean)) break;
    for (let j0 = 0; j0 < dicho.length; j0++) {
      if (!igual(cita[i0].norm, dicho[j0].norm)) continue;
      const usadas = new Set([j0]);
      let aciertos = 1;
      let pegadas = 1;
      let pos = j0;
      let anteriorHallada = true;
      let falta = false;
      for (let i = i0 + 1; i < k; i++) {
        const tope = Math.min(dicho.length - 1, pos + MAX_SALTO + 1);
        let hallada = -1;
        for (let j = pos + 1; j <= tope; j++) {
          if (igual(cita[i].norm, dicho[j].norm)) {
            hallada = j;
            break;
          }
        }
        if (hallada >= 0) {
          aciertos++;
          if (anteriorHallada && hallada - pos <= 2) pegadas++;
          usadas.add(hallada);
          pos = hallada;
          anteriorHallada = true;
        } else {
          anteriorHallada = false;
          if (exigidas[i]) {
            falta = true;
            break;
          }
        }
      }
      if (falta || aciertos < minimo || pegadas < minimoPegadas || pos - j0 + 1 > 2 * k + 4) continue;
      // Lo dicho no puede tener, dentro del tramo, una negación o un número que la cita se saltó; ni una negación justo
      // antes, si la cita no empieza por una («No, no está aprobado» no respalda «está aprobado»).
      let sobra = false;
      for (let j = j0; j <= pos && !sobra; j++) sobra = !usadas.has(j) && cambiaElSentido(dicho[j]);
      if (!cambiaElSentido(dicho[j0])) for (let j = Math.max(0, j0 - 2); j < j0 && !sobra; j++) sobra = cambiaElSentido(dicho[j]);
      if (sobra) continue;
      const largo = pos - j0;
      if (
        !mejor ||
        aciertos > mejor.aciertos ||
        (aciertos === mejor.aciertos && (pegadas > mejor.pegadas || (pegadas === mejor.pegadas && largo < mejor.hasta - mejor.desde)))
      )
        mejor = { desde: j0, hasta: pos, aciertos, pegadas };
      if (mejor.aciertos === k && mejor.pegadas === k) return mejor;
    }
  }
  return mejor;
}

/** El tramo de lo dicho, con su ortografía, el signo que lo abre y el que lo cierra. */
function tramo(texto: string, p: readonly Palabra[], t: { desde: number; hasta: number }): string {
  const inicio = p[t.desde].inicio;
  const fin = p[t.hasta].fin;
  const cierra = /^[?!.…»”"]/.exec(texto.slice(fin))?.[0] ?? "";
  const abre = /[¿¡«“"]$/.test(texto.slice(0, inicio)) ? 1 : 0;
  return texto.slice(inicio - abre, fin + cierra.length).trim().slice(0, 400);
}

/**
 * El pedazo de lo dicho que corresponde a la cita, con la ortografía de la TRANSCRIPCIÓN (tildes, eñes, signos de
 * pregunta y muletillas incluidos): «el año que viene, ¿no hay presupuesto?» no puede mostrarse como «el ano que viene no
 * hay presupuesto». null si la cita no está.
 */
export function extraerDelTurno(turno: string, cita: string): string | null {
  const p = palabras(turno);
  const t = ubicar(palabras(cita), p);
  return t ? tramo(turno, p, t) : null;
}

/** Las palabras de cada turno, partidas una sola vez por conversación (una lectura verifica decenas de citas). */
const palabrasDeLosTurnos = new WeakMap<readonly TurnoNumerado[], { palabras: Palabra[]; conjunto: Set<string> }[]>();

function partidos(turnos: readonly TurnoNumerado[]) {
  let p = palabrasDeLosTurnos.get(turnos);
  if (!p) {
    p = turnos.map((t) => {
      const ps = palabras(t.texto);
      return { palabras: ps, conjunto: new Set(ps.map((x) => x.norm)) };
    });
    palabrasDeLosTurnos.set(turnos, p);
  }
  return p;
}

/**
 * Busca la cita en su turno; si no, unida al turno anterior o al siguiente de la misma persona (la transcripción corta a
 * veces una frase en dos); si no (el número estaba mal), en cualquier turno. null si no está. Recorrer la conversación
 * entera solo mira de cerca los turnos que tienen al menos la mitad de las palabras de la cita.
 */
export function verificarCita(c: { turno?: unknown; texto?: unknown }, turnos: readonly TurnoNumerado[]): Cita | null {
  if (typeof c.texto !== "string") return null;
  if (paraComparar(c.texto).replace(/\s/g, "").length < MIN_LETRAS_DE_UNA_CITA) return null;
  const cita = palabras(c.texto);
  const p = partidos(turnos);
  const n = typeof c.turno === "number" ? c.turno : Number(c.turno);
  const i = turnos.findIndex((t) => t.n === n);
  const necesarias = Math.ceil(cita.length / 2);
  const prometedor = (desde: number, hasta: number) =>
    cita.filter((x) => p[desde].conjunto.has(x.norm) || (desde !== hasta && p[hasta].conjunto.has(x.norm))).length >= necesarias;
  const enEste = (desde: number, hasta: number, filtrar: boolean): Cita | null => {
    const a = turnos[desde];
    const b = turnos[hasta];
    if (!a || !b || (desde !== hasta && a.hablante !== b.hablante)) return null;
    if (filtrar && !prometedor(desde, hasta)) return null;
    const texto = desde === hasta ? a.texto : `${a.texto} ${b.texto}`;
    const corrimiento = a.texto.length + 1;
    const ps = desde === hasta ? p[desde].palabras : [...p[desde].palabras, ...p[hasta].palabras.map((x) => ({ ...x, inicio: x.inicio + corrimiento, fin: x.fin + corrimiento }))];
    const t = ubicar(cita, ps);
    return t ? { turno: a.n, hablante: a.hablante, texto: tramo(texto, ps, t) } : null;
  };
  // El turno que sigue de la misma persona, si lo que hay en medio son interjecciones de otro («Mhm.», «Claro.»). Una
  // pregunta corta («¿Y lo usan todos?») no es interjección: la respuesta que sigue no es la misma frase.
  const interjeccion = (k: number) => p[k].palabras.length <= PALABRAS_DE_UNA_INTERJECCION && !turnos[k].texto.includes("?");
  const siguiente = (j: number): number => {
    for (let k = j + 1; k < turnos.length && k <= j + MAX_INTERJECCIONES + 1; k++) {
      if (turnos[k].hablante === turnos[j].hablante) return k;
      if (!interjeccion(k)) return -1;
    }
    return -1;
  };
  const anterior = (j: number): number => {
    for (let k = j - 1; k >= 0 && k >= j - MAX_INTERJECCIONES - 1; k--) {
      if (turnos[k].hablante === turnos[j].hablante) return k;
      if (!interjeccion(k)) return -1;
    }
    return -1;
  };
  if (i >= 0) {
    const cerca = enEste(i, i, false) ?? enEste(anterior(i), i, false) ?? enEste(i, siguiente(i), false);
    if (cerca) return cerca;
  }
  for (let j = 0; j < turnos.length; j++) {
    const otra = enEste(j, j, true) ?? enEste(j, siguiente(j), true);
    if (otra) return otra;
  }
  return null;
}

/** Entre dos pedazos de una misma frase puede haber hasta dos turnos de otro, de hasta cuatro palabras cada uno. */
const MAX_INTERJECCIONES = 2;
const PALABRAS_DE_UNA_INTERJECCION = 4;

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Una dimensión de lo que se esperaba explorar (alcance.ts), con su área. */
export interface DimensionEsperada {
  nombre: string;
  area: string;
}

/** Lo que tenía el material: un juicio de «sin guía» con guía (o al revés) no vale. */
export interface LoQueHabia {
  guia: boolean;
  escala: boolean;
  posicionamiento: boolean;
  /** Había algo que explorar en el alcance de la sesión (lib/analizador-venta/alcance.ts). Sin el dato, `escala`. */
  dimensiones?: boolean;
  /** Lo que se esperaba explorar, con su área. Con el dato, un juicio de exploración fuera de la lista no vale. */
  esperadas?: readonly DimensionEsperada[];
  /** El área de la sesión ya se sabía (el equipo de la sesión o la guía enfocada): el foco es esa, no lo que diga el modelo. */
  areaFija?: boolean;
  /** Los títulos de los casos de uso ya elegidos en la preventa. */
  casos?: readonly string[];
  /**
   * Quiénes hablaron del lado del cliente (quien-hablo.ts). Con el dato, lo que sale fuera del objetivo y las preguntas
   * para el demo necesitan una cita de uno de ellos.
   */
  delCliente?: readonly string[];
  /** Lo que ya se sabía para decidir (la preventa y las sesiones anteriores de la MISMA empresa): no falta. */
  yaSeSabe?: Partial<Record<HuecoDeDecision, string>>;
}

/** ¿El valor contradice lo que tenía el material? */
function contradiceElMaterial(punto: PuntoJuzgado, valor: string, habia: LoQueHabia): boolean {
  if (punto === "guia") return habia.guia === (valor === "sin_guia");
  if (punto === "escala") return habia.escala === (valor === "sin_escala");
  if (punto === "posicionamiento") return habia.posicionamiento === (valor === "sin_posicionamiento");
  if (punto === "exploracion") return !(habia.dimensiones ?? habia.escala);

  return false;
}

/** «Datos (Ventas)» → { nombre: "Datos", area: "Ventas" }. Sin paréntesis, el área es null. */
export function separarArea(dimension: string): { nombre: string; area: string | null } {
  const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(dimension.trim());
  return m ? { nombre: m[1].trim(), area: m[2].trim() } : { nombre: dimension.trim(), area: null };
}

/** La dimensión que nombró el modelo, entre las que se esperaban (por nombre y área, o solo por nombre si es única). */
function dimensionEsperada(dicha: string, esperadas: readonly DimensionEsperada[]): DimensionEsperada | null {
  const { nombre, area } = separarArea(dicha);
  const mismas = esperadas.filter((e) => paraComparar(e.nombre) === paraComparar(nombre));
  if (area) return mismas.find((e) => paraComparar(e.area) === paraComparar(area)) ?? null;
  return mismas.length === 1 ? mismas[0] : null;
}

/**
 * Cada cita que está. Una que no está tal cual pero junta frases (2026-11-08, Centauro: «…me llama el dueño de la empresa.
 * Resulta que una de las herramientas corta el 25…», con medio turno en el medio) se prueba frase por frase: cada pedazo
 * que esté vale como cita aparte. Lo que se muestra sigue siendo lo dicho, y cada pedazo pasa la misma vara.
 */
const verificar = (citas: unknown, turnos: readonly TurnoNumerado[]): Cita[] => {
  const out: Cita[] = [];
  for (const c of Array.isArray(citas) ? citas : []) {
    const x = (c ?? {}) as { turno?: unknown; texto?: unknown };
    const entera = verificarCita(x, turnos);
    const pedazos =
      entera || typeof x.texto !== "string"
        ? []
        : x.texto
            .split(/(?<=[.;!?…])\s+/)
            .filter((p) => p.trim().split(/\s+/).length >= 5)
            .map((p) => verificarCita({ turno: x.turno, texto: p }, turnos));
    // Partida, vale solo si TODAS sus frases están: con una cierta y otra inventada («No tenemos ningún CRM. Usamos
    // Excel…»), la cierta sostendría un juicio que dice lo contrario de lo que se dijo (lo cazó la revisión).
    const todos = pedazos.length > 1 && pedazos.every(Boolean);
    for (const v of entera ? [entera] : todos ? pedazos : []) {
      if (v && !out.some((o) => o.turno === v.turno && o.texto === v.texto)) out.push(v);
    }
  }
  return out;
};

/** Lo que salió bien o lo que hay que mejorar: solo con una cita que esté. Cuenta las que se cayeron. */
function leerObservaciones(v: unknown, turnos: readonly TurnoNumerado[]): { lista: Observacion[]; sinCita: number } {
  let sinCita = 0;
  const lista: Observacion[] = [];
  for (const r of Array.isArray(v) ? v : []) {
    const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const t = texto(x.texto, 500);
    if (!t) continue;
    const citas = verificar(x.citas, turnos).slice(0, 2);
    if (!citas.length) {
      sinCita++;
      continue;
    }
    const decir = texto(x.decir, 300);
    lista.push({ texto: t, citas, ...(decir ? { decir } : {}) });
  }
  return { lista: lista.slice(0, 3), sinCita };
}

/* ── Lo del 8 nov ────────────────────────────────────────────────────────────── */

const objeto = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arreglo = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** La cita más nueva (la del turno más alto): si el cliente corrigió algo, es la corrección. */
const laMasNueva = (citas: readonly Cita[]): Cita | null => citas.reduce<Cita | null>((m, c) => (!m || c.turno > m.turno ? c : m), null);

/** ¿Habló del lado del cliente? Sin la lista, cualquiera. */
const delCliente = (c: Cita, habia: LoQueHabia) => !habia.delCliente?.length || habia.delCliente.some((n) => paraComparar(n) === paraComparar(c.hablante));

/** Los números de un texto, normalizados como en la verificación («2.000» = «2000», «dos» = «2»). */
export function numerosDe(texto: string): string[] {
  return palabras(texto)
    .map((p) => p.norm)
    .filter(conNumero);
}

/** Una pregunta con sus signos: «¿…?». */
function comoPregunta(t: string): string | null {
  const s = t.trim().replace(/^¿+/, "").replace(/\?+$/, "").trim();
  return s ? `¿${s}?` : null;
}

/**
 * Una corrección dicha en un turno de un solo número («25.», justo después de que otro dijo «30»): es demasiado corta para
 * ser cita de un juicio, pero es la cifra. Vale solo si la cita ES el turno entero y trae un número.
 */
function turnoCortoConNumero(c: unknown, turnos: readonly TurnoNumerado[]): Cita | null {
  const x = objeto(c);
  if (typeof x.texto !== "string" || !numerosDe(x.texto).length) return null;
  const t = turnos.find((u) => u.n === Number(x.turno));
  return t && paraComparar(t.texto) === paraComparar(x.texto) ? { turno: t.n, hablante: t.hablante, texto: t.texto.trim() } : null;
}

/**
 * Una cifra de la tabla: vale si alguna de sus citas está y TODOS sus números están en la más nueva. Así, si el cliente
 * dijo «30» y después corrigió «25», una celda con «30» que cita la corrección no pasa, y una con «25» sí.
 */
function leerCifra(v: unknown, turnos: readonly TurnoNumerado[], habia: LoQueHabia): CifraDicha | null {
  const x = objeto(v);
  const t = texto(x.texto, 160);
  // Con dígitos: «un millón» no se puede comparar con nada (la revisión: pasaba con cualquier cita).
  if (!t || !numerosDe(t).length) return null;
  // Es lo que dijo el CLIENTE: una cifra que solo dijo el vendedor («¿cierran unos 30 al mes?») no va.
  const candidatas = [...verificar(x.citas, turnos), ...arreglo(x.citas).map((c) => turnoCortoConNumero(c, turnos)).filter((c): c is Cita => !!c)];
  const cita = laMasNueva(candidatas.filter((c) => delCliente(c, habia)));
  if (!cita) return null;
  const enLaCita = new Set(cantidadesDe(cita.texto));
  if (!cantidadesDe(t).every((n) => enLaCita.has(n))) return null;
  return { texto: t, cita };
}

/** Lo que multiplica un número: «25 mil» no es «25 millones». */
const MULTIPLICADORES = new Set(["mil", "millon", "millones", "k"]);
const multiplicador = (p: Palabra | undefined) => (p && MULTIPLICADORES.has(p.norm) ? (p.norm === "millones" ? "millon" : p.norm) : "");

/** Cada número con lo que lo multiplica («25 mil» → «25·mil»): así se comparan las cifras de la tabla. */
export function cantidadesDe(texto: string): string[] {
  const ps = palabras(texto);
  return ps.flatMap((p, i) => (conNumero(p.norm) ? [`${p.norm}·${multiplicador(ps[i + 1])}`] : []));
}

function leerNumeros(v: unknown, turnos: readonly TurnoNumerado[], habia: LoQueHabia): { filas: FilaDeNumeros[]; caidas: number } {
  let caidas = 0;
  const filas: FilaDeNumeros[] = [];
  for (const r of arreglo(v)) {
    const x = objeto(r);
    const tema = (TEMAS_DE_NUMEROS as readonly string[]).includes(x.tema as string) ? (x.tema as TemaDeNumeros) : null;
    const que = texto(x.que, 80);
    if (!tema || !que) {
      caidas++;
      continue;
    }
    const meta = x.meta ? leerCifra(x.meta, turnos, habia) : null;
    const realidad = x.realidad ? leerCifra(x.realidad, turnos, habia) : null;
    if ((x.meta && !meta) || (x.realidad && !realidad)) caidas++;
    const falta = comoPregunta(texto(x.falta, 220));
    if (!meta && !realidad && !falta) continue;
    filas.push({ tema, que, meta, realidad, falta });
  }
  return { filas: filas.slice(0, 6), caidas };
}

/**
 * Los cuatro huecos, siempre. «Se sabe» necesita una cita de esta reunión, o que ya se supiera de antes. Lo que ya se
 * sabía nunca sale como faltante (Elías: «si la misma empresa ya tiene sesiones anteriores, tomarlas en cuenta»).
 */
function leerDecision(v: unknown, turnos: readonly TurnoNumerado[], habia: LoQueHabia): Decision[] {
  const dichos = new Map<HuecoDeDecision, Record<string, unknown>>();
  for (const r of arreglo(v)) {
    const x = objeto(r);
    const h = (HUECOS_DE_DECISION as readonly string[]).includes(x.hueco as string) ? (x.hueco as HuecoDeDecision) : null;
    if (h && !dichos.has(h)) dichos.set(h, x);
  }
  return HUECOS_DE_DECISION.map((hueco) => {
    const x = dichos.get(hueco) ?? {};
    const antes = habia.yaSeSabe?.[hueco]?.trim();
    const t = texto(x.texto, 300);
    if (x.estado === "se_sabe") {
      const cita = verificar(x.citas, turnos)[0] ?? null;
      if (cita && t) return { hueco, seSabe: true, texto: t, cita, deAntes: false };
    }
    if (antes) return { hueco, seSabe: true, texto: antes.slice(0, 300), cita: null, deAntes: true };
    return { hueco, seSabe: false, texto: (x.estado === "falta" && comoPregunta(t)) || PREGUNTA_DEL_HUECO[hueco], cita: null, deAntes: false };
  });
}

const DIAS_DE_LA_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
/** Cuántos turnos alrededor de la cita se mira si el día que dice el paso se dijo (el acuerdo se arma de a pedazos). */
const VENTANA_DEL_ACUERDO = 4;

/**
 * Los próximos pasos: con una cita que esté; el día de la semana que dice el paso, dicho en la cita o a pocos turnos de
 * ella (si dice «martes» y alrededor de su cita solo se habló del miércoles, no pasa); y de dos versiones del mismo paso
 * (mismo `tema`), la más nueva: lo último que se acordó manda.
 */
function leerPasos(v: unknown, turnos: readonly TurnoNumerado[]): { pasos: PasoAcordado[]; caidos: number } {
  let caidos = 0;
  const porTema = new Map<string, PasoAcordado>();
  for (const r of arreglo(v)) {
    const x = objeto(r);
    const que = texto(x.que, 240);
    const tema = paraComparar(texto(x.tema, 80) || que);
    const cita = laMasNueva(verificar(x.citas, turnos));
    if (!que || !cita) {
      caidos++;
      continue;
    }
    const cuando = texto(x.cuando, 120) || null;
    const i = turnos.findIndex((t) => t.n === cita.turno);
    const alrededor = new Set(
      turnos
        .slice(Math.max(0, i - VENTANA_DEL_ACUERDO), i + VENTANA_DEL_ACUERDO + 1)
        .flatMap((t) => palabras(t.texto).map((p) => p.norm)),
    );
    const dias = cuando ? palabras(cuando).map((p) => p.norm).filter((p) => DIAS_DE_LA_SEMANA.includes(p)) : [];
    if (dias.some((d) => !alrededor.has(d))) {
      caidos++;
      continue;
    }
    // El «con quién», también contra lo dicho alrededor (la otra mitad de Centauro: «con Fernando» cuando fue con
    // Catalina). Se acepta el apodo («Cata» por Catalina). Si no se dijo ahí, el paso queda sin «con quién».
    const dicho = turnos.slice(Math.max(0, i - VENTANA_DEL_ACUERDO), i + VENTANA_DEL_ACUERDO + 1).flatMap((t) => [...palabras(t.texto), ...palabras(t.hablante)].map((p) => p.norm));
    const nombrado = (n: string) => dicho.some((d) => d.length >= 4 && (d === n || n.startsWith(d) || d.startsWith(n.slice(0, 4))));
    const dichoQuien = texto(x.quien, 120);
    const nombres = palabras(dichoQuien).map((p) => p.norm).filter((n) => n.length >= 4 && n !== "con");
    const quien = dichoQuien && nombres.some(nombrado) ? dichoQuien : null;
    const paso: PasoAcordado = { que, cuando, quien, cita };
    const previo = porTema.get(tema);
    if (!previo || previo.cita.turno < cita.turno) porTema.set(tema, paso);
  }
  return { pasos: [...porTema.values()].sort((a, b) => a.cita.turno - b.cita.turno).slice(0, 5), caidos };
}

/**
 * Un paso verificado en sus partes para mostrarlo: qué, cuándo y con quién (sin repetir el «con» si el qué ya lo dice).
 * Lo usan `pasosEnPalabras` y la tarjeta «Siguiente paso acordado» de «Lo que dejó la sesión» (2026-11-08, sexta vuelta:
 * esa tarjeta la escribía solo el agente que lee la reunión, sin cruzarla con lo verificado).
 */
export function partesDelPaso(p: PasoAcordado): { que: string; cuando: string | null; conQuien: string | null } {
  const quien = p.quien?.replace(/^con\s+/i, "") ?? null;
  // «Sesión con Catalina…» ya dice con quién: no se repite.
  const yaLoDice = !!quien && paraComparar(p.que).includes(paraComparar(quien));
  return { que: p.que.replace(/\.$/, ""), cuando: p.cuando, conQuien: quien && !yaLoDice ? quien : null };
}

/** El siguiente paso en palabras, armado con los pasos verificados (reemplaza la lectura del modelo). */
export function pasosEnPalabras(pasos: readonly PasoAcordado[]): string {
  return (
    pasos
      .map((p) => {
        const x = partesDelPaso(p);
        return [x.que, x.cuando, x.conQuien ? `con ${x.conQuien}` : null].filter(Boolean).join(", ");
      })
      .join(". ") + "."
  );
}

function leerDemo(v: unknown, turnos: readonly TurnoNumerado[], habia: LoQueHabia): { demo: PreguntaDelDemo[]; caidas: number } {
  let caidas = 0;
  const demo: PreguntaDelDemo[] = [];
  for (const r of arreglo(v)) {
    const x = objeto(r);
    const pregunta = texto(x.pregunta, 160);
    const cita = verificar(x.citas, turnos).find((c) => delCliente(c, habia));
    if (!pregunta || !cita) {
      caidas++;
      continue;
    }
    if (demo.some((d) => paraComparar(d.pregunta) === paraComparar(pregunta))) continue;
    demo.push({ pregunta, quien: cita.hablante, cita });
  }
  return { demo: demo.slice(0, 5), caidas };
}

/** Lo que salió fuera del objetivo: solo con una cita del CLIENTE (es su dolor, no lo que dijo el vendedor). */
function leerFueraDelObjetivo(v: unknown, turnos: readonly TurnoNumerado[], habia: LoQueHabia): { lista: Observacion[]; sinCita: number } {
  const leidas = leerObservaciones(v, turnos);
  const conCliente = leidas.lista.map((o) => ({ ...o, citas: o.citas.filter((c) => delCliente(c, habia)) })).filter((o) => o.citas.length);
  return { lista: conCliente.slice(0, 2), sinCita: leidas.sinCita + (leidas.lista.length - conCliente.length) };
}

/**
 * Lee lo que devolvió el modelo y deja solo lo verificable. `descartados`: los juicios sin ninguna cita que aparezca en
 * la transcripción, con un punto o un valor que no existe, o que contradicen lo que tenía el material («sin guía» con
 * guía), y lo que salió bien o hay que mejorar sin cita. Un juicio por ausencia («se saltó», «sin explorar») vale sin
 * cita SOLO si el modelo no dio ninguna: si dio una y no está en la transcripción, inventó la prueba y se descarta.
 */
export function leerElAnalisis(
  crudo: unknown,
  turnos: readonly TurnoNumerado[],
  habia: LoQueHabia = { guia: true, escala: true, posicionamiento: true },
): { resultado: ResultadoDelAnalisis; descartados: number } {
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  let descartados = 0;
  const juicios: Juicio[] = [];
  for (const j of Array.isArray(o.juicios) ? o.juicios : []) {
    const x = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
    const punto = (PUNTOS_JUZGADOS as readonly string[]).includes(x.punto as string) ? (x.punto as PuntoJuzgado) : null;
    let valor = punto && VALORES[punto].includes(x.valor as string) ? (x.valor as string) : null;
    const lectura = texto(x.lectura, 600);
    if (!punto || !valor || !lectura || contradiceElMaterial(punto, valor, habia)) {
      descartados++;
      continue;
    }
    const etapa = punto === "etapa" && (ETAPAS as readonly string[]).includes(x.etapa as string) ? (x.etapa as EtapaDelProceso) : null;
    if (punto === "etapa" && !etapa) {
      descartados++;
      continue;
    }
    // La exploración, sobre lo que se esperaba explorar y ninguna otra cosa.
    let dimension: string | null = null;
    let area: string | null = null;
    if (punto === "exploracion") {
      const dicha = texto(x.dimension, 160);
      const esperada = habia.esperadas ? dimensionEsperada(dicha, habia.esperadas) : null;
      if (habia.esperadas && !esperada) {
        descartados++;
        continue;
      }
      const suelta = separarArea(dicha);
      dimension = esperada?.nombre ?? (suelta.nombre || null);
      area = esperada?.area ?? suelta.area;
    }
    const dadas = Array.isArray(x.citas) ? x.citas : [];
    const citas = verificar(dadas, turnos);
    // Tres estados (2026-11-08): una dimensión «sin explorar» con una cita que está SÍ se mencionó. Antes quedaba como «no
    // se tocó» con la cita al lado (Centauro: Datos, con «estamos ciegos a esa información»).
    if (punto === "exploracion" && valor === "sin_explorar" && citas.length) valor = "tocado";
    const porAusencia = POR_AUSENCIA[punto].includes(valor) && dadas.length === 0;
    if (!citas.length && !porAusencia) {
      descartados++;
      continue;
    }
    const casoDicho = punto === "caso_de_uso" ? texto(x.caso, 200) : "";
    const caso = casoDicho ? (habia.casos ?? []).find((t) => paraComparar(t) === paraComparar(casoDicho)) ?? null : null;
    juicios.push({
      punto,
      etapa,
      dimension,
      ...(punto === "exploracion" ? { area } : {}),
      ...(punto === "caso_de_uso" ? { caso } : {}),
      valor,
      lectura,
      citas: citas.slice(0, 3),
      porAusencia,
    });
  }

  // Se guarda todo lo juzgado; lo que no se tocó de las áreas fuera del foco se deja de mostrar al leerlo
  // (`exploracionEnFoco`), no se borra: si el foco estuviera mal, el dato sigue ahí.
  const enfoque = leerElEnfoque(o.enfoque, juicios, habia);
  const bien = leerObservaciones(o.bien, turnos);
  const recomendaciones = leerObservaciones(o.recomendaciones, turnos);
  descartados += bien.sinCita + recomendaciones.sinCita;

  // Lo del 8 nov. Lo que no se sostiene se cae y se cuenta, como un juicio sin cita.
  const fuera = leerFueraDelObjetivo(o.fuera_del_objetivo, turnos, habia);
  const numeros = leerNumeros(o.numeros, turnos, habia);
  const decision = leerDecision(o.decision, turnos, habia);
  const pasos = leerPasos(o.pasos, turnos);
  const demo = leerDemo(o.demo, turnos, habia);
  descartados += fuera.sinCita + numeros.caidas + pasos.caidos + demo.caidas;
  // El siguiente paso se dice con los pasos verificados (lo último que se acordó), no con la lectura libre del modelo: en
  // Centauro decía «el martes con Fernando» cuando quedó el miércoles a las 2 con Catalina.
  if (pasos.pasos.length) {
    const i = juicios.findIndex((j) => j.punto === "siguiente_paso");
    const conFecha = pasos.pasos.filter((p) => p.cuando);
    const valor = conFecha.some((p) => p.quien) ? "con_fecha_y_duenio" : conFecha.length ? "sin_duenio" : "sin_fecha";
    const deLosPasos = { lectura: pasosEnPalabras(pasos.pasos), citas: pasos.pasos.map((p) => p.cita).slice(0, 3), porAusencia: false };
    if (i >= 0)
      // «Ninguno» con pasos acordados se contradice: manda lo verificado.
      juicios[i] = { ...juicios[i], ...deLosPasos, valor: juicios[i].valor === "ninguno" ? valor : juicios[i].valor };
    // Sin el juicio (no vino, o se cayó por una cita que no está), los pasos verificados no pueden quedar sin pantalla:
    // la pieza «Análisis» y el análisis completo leen el siguiente paso de acá (lo cazó la revisión).
    else juicios.push({ punto: "siguiente_paso", etapa: null, dimension: null, valor, ...deLosPasos });
  }
  return {
    resultado: {
      resumen: texto(o.resumen, 900),
      juicios,
      bien: bien.lista,
      recomendaciones: recomendaciones.lista,
      enfoque,
      fueraDelObjetivo: fuera.lista,
      numeros: numeros.filas,
      decision,
      pasos: pasos.pasos,
      demo: demo.demo,
    },
    descartados,
  };
}

/** El área de un juicio de exploración: la guardada o, en los de antes del 29 oct, la del paréntesis del nombre. */
export function areaDelJuicio(j: Pick<Juicio, "dimension" | "area">): string | null {
  return j.area ?? (j.dimension ? separarArea(j.dimension).area : null);
}

/**
 * Los juicios de exploración del área a la que fueron las preguntas: el foco guardado o, en los análisis de antes del
 * 29 oct, las áreas donde algo se exploró o se tocó con cita. Sin foco que se sepa, todos (no se esconde nada). Lo usan
 * la pantalla y la tendencia, así un análisis viejo (que juzgaba hasta 24 dimensiones) y uno nuevo cuentan lo mismo.
 * `areaDe`: para los juicios que no traen el área (por su nombre en la escala).
 */
export function exploracionEnFoco(r: Pick<ResultadoDelAnalisis, "juicios" | "enfoque">, areaDe: (dimension: string) => string | null = () => null): Juicio[] {
  const ex = r.juicios.filter((j) => j.punto === "exploracion" && j.dimension);
  const area = (j: Juicio) => areaDelJuicio(j) ?? areaDe(separarArea(j.dimension!).nombre);
  const foco = r.enfoque?.areas.length ? r.enfoque.areas : [...new Set(ex.filter((j) => j.valor !== "sin_explorar").map(area).filter((a): a is string => !!a))];
  if (!foco.length) return ex;
  return ex.filter((j) => {
    const a = area(j);
    return !a || foco.some((f) => paraComparar(f) === paraComparar(a));
  });
}

/**
 * El foco de la sesión. Con el área ya fijada por la sesión (su equipo o la guía enfocada), es esa. Si no, las áreas que
 * dice el modelo, de las que se esperaban, MÁS las de toda dimensión que se exploró o se tocó con cita (si se tocó, la
 * conversación fue ahí). Sin nada de eso, todas las esperadas: no se esconde nada. null sin lista de lo esperado.
 */
function leerElEnfoque(v: unknown, juicios: readonly Juicio[], habia: LoQueHabia): EnfoqueDeLaSesion | null {
  if (!habia.esperadas?.length) return null;
  const x = (v && typeof v === "object" ? v : {}) as { areas?: unknown; lectura?: unknown };
  const todas = [...new Set(habia.esperadas.map((d) => d.area))];
  const deLaLista = (a: string) => todas.find((t) => paraComparar(t) === paraComparar(a));
  let areas: string[];
  if (habia.areaFija) areas = todas;
  else {
    const dichas = (Array.isArray(x.areas) ? x.areas : []).filter((a): a is string => typeof a === "string").map(deLaLista);
    const conCita = juicios.filter((j) => j.punto === "exploracion" && j.valor !== "sin_explorar" && j.area).map((j) => deLaLista(j.area!));
    const elegidas = new Set([...dichas, ...conCita].filter((a): a is string => !!a));
    areas = elegidas.size ? todas.filter((a) => elegidas.has(a)) : todas;
  }
  return { areas, sinTocar: todas.filter((a) => !areas.includes(a)), lectura: texto(x.lectura, 500) };
}

/** El resultado guardado, leído tolerante (un Json raro es «sin análisis»). Lo de antes del 29 oct, sin `bien` ni foco. */
export function leerResultadoGuardado(v: unknown): ResultadoDelAnalisis | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Partial<ResultadoDelAnalisis>;
  if (typeof o.resumen !== "string" || !Array.isArray(o.juicios) || !Array.isArray(o.recomendaciones)) return null;
  const enfoque = o.enfoque && typeof o.enfoque === "object" && Array.isArray(o.enfoque.areas) ? o.enfoque : null;
  // Lo del 8 nov, solo si está (un análisis de antes no lo tiene: la pantalla no lo muestra, no lo da por vacío).
  const desde8nov = Object.fromEntries(
    (["fueraDelObjetivo", "numeros", "decision", "pasos", "demo"] as const).filter((k) => Array.isArray(o[k])).map((k) => [k, o[k]]),
  ) as Pick<ResultadoDelAnalisis, "fueraDelObjetivo" | "numeros" | "decision" | "pasos" | "demo">;
  return { resumen: o.resumen, juicios: o.juicios, bien: Array.isArray(o.bien) ? o.bien : [], recomendaciones: o.recomendaciones, enfoque, ...desde8nov };
}
