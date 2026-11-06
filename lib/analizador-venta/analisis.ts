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
  tocado: "Tocado",
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
}
export type Recomendacion = Observacion;

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
}

/* ── La herramienta que llena el modelo ─────────────────────────────────────────── */

const CITAS = {
  type: "array",
  description: "Las citas que respaldan lo dicho: el número del turno y el pedazo dicho, copiado tal cual (entre 5 y 40 palabras).",
  items: {
    type: "object",
    properties: { turno: { type: "integer" }, texto: { type: "string" } },
    required: ["turno", "texto"],
  },
} as const;

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
          "Dos o tres frases, en tono neutro y sin puntaje: lo que salió bien; si ya se exploró a fondo el dolor del área (qué resultado necesita el cliente y por qué no lo tiene hoy); y si ya hay base para ofrecer un caso de uso ligado a lo que más impacto le causa, o qué falta para llegar ahí.",
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
            lectura: { type: "string", description: "Una o dos frases en tuteo, concretas y neutras." },
            citas: CITAS,
          },
          required: ["punto", "valor", "lectura", "citas"],
        },
      },
      bien: OBSERVACIONES("Lo que salió bien: hasta tres, cada una con la cita del momento. Sin cita no va."),
      recomendaciones: OBSERVACIONES("Para mejorar: dos o tres, cada una con la cita del momento que la motiva (lo que dijo el cliente y no se profundizó). Sin cita no va."),
    },
    required: ["resumen", "enfoque", "juicios", "bien", "recomendaciones"],
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
    if (NEGACIONES.has(x.norm) && ps[i + 1]?.norm === x.norm) x.relleno = true;
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

const verificar = (citas: unknown, turnos: readonly TurnoNumerado[]) =>
  (Array.isArray(citas) ? citas : []).map((c) => verificarCita((c ?? {}) as { turno?: unknown; texto?: unknown }, turnos)).filter((c): c is Cita => !!c);

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
    lista.push({ texto: t, citas });
  }
  return { lista: lista.slice(0, 3), sinCita };
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
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as { resumen?: unknown; juicios?: unknown; bien?: unknown; recomendaciones?: unknown; enfoque?: unknown };
  let descartados = 0;
  const juicios: Juicio[] = [];
  for (const j of Array.isArray(o.juicios) ? o.juicios : []) {
    const x = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
    const punto = (PUNTOS_JUZGADOS as readonly string[]).includes(x.punto as string) ? (x.punto as PuntoJuzgado) : null;
    const valor = punto && VALORES[punto].includes(x.valor as string) ? (x.valor as string) : null;
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
  return { resultado: { resumen: texto(o.resumen, 900), juicios, bien: bien.lista, recomendaciones: recomendaciones.lista, enfoque }, descartados };
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
  return { resumen: o.resumen, juicios: o.juicios, bien: Array.isArray(o.bien) ? o.bien : [], recomendaciones: o.recomendaciones, enfoque };
}
