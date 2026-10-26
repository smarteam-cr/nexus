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
 */
import { ETAPAS, type EtapaDelProceso } from "./criterio";

/** Los puntos que juzga el modelo (el 3, quién habló, y las recomendaciones van aparte). */
export const PUNTOS_JUZGADOS = ["consultiva", "temas", "guia", "escala", "posicionamiento", "exploracion", "posicion", "siguiente_paso", "etapa"] as const;
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
  dimension: string | null;
  valor: string | null;
  lectura: string;
  citas: Cita[];
  /** Dice que algo NO pasó: no trae cita. */
  porAusencia: boolean;
}

export interface Recomendacion {
  texto: string;
  citas: Cita[];
}

export interface ResultadoDelAnalisis {
  resumen: string;
  juicios: Juicio[];
  recomendaciones: Recomendacion[];
}

/* ── La herramienta que llena el modelo ─────────────────────────────────────────── */

const CITAS = {
  type: "array",
  description: "Las citas que respaldan el juicio: el número del turno y el pedazo dicho, copiado tal cual (entre 5 y 40 palabras).",
  items: {
    type: "object",
    properties: { turno: { type: "integer" }, texto: { type: "string" } },
    required: ["turno", "texto"],
  },
} as const;

/** El `input_schema` de la herramienta `registrar_analisis` (la API arma el objeto: no hay JSON que escapar). */
export const HERRAMIENTA_DEL_ANALISIS = {
  name: "registrar_analisis",
  description: "Registra el análisis de la reunión de venta, cada juicio con sus citas de la conversación.",
  input_schema: {
    type: "object",
    properties: {
      resumen: { type: "string", description: "Dos o tres frases para el vendedor: cómo fue la reunión, sin puntaje." },
      juicios: {
        type: "array",
        items: {
          type: "object",
          properties: {
            punto: { type: "string", enum: [...PUNTOS_JUZGADOS] },
            etapa: { type: "string", enum: [...ETAPAS], description: "Solo si punto = etapa." },
            dimension: { type: "string", description: "Solo si punto = exploracion: el nombre de la dimensión de la escala." },
            valor: { type: "string", description: "Uno de los valores permitidos para ese punto." },
            lectura: { type: "string", description: "Una o dos frases en tuteo, concretas." },
            citas: CITAS,
          },
          required: ["punto", "valor", "lectura", "citas"],
        },
      },
      recomendaciones: {
        type: "array",
        items: { type: "object", properties: { texto: { type: "string" }, citas: CITAS }, required: ["texto", "citas"] },
      },
    },
    required: ["resumen", "juicios", "recomendaciones"],
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

/** Busca la cita en su turno (o, si el número estaba mal, en cualquier otro). null si no está. */
export function verificarCita(c: { turno?: unknown; texto?: unknown }, turnos: readonly TurnoNumerado[]): Cita | null {
  if (typeof c.texto !== "string") return null;
  const buscada = paraComparar(c.texto);
  if (buscada.replace(/\s/g, "").length < MIN_LETRAS_DE_UNA_CITA) return null;
  const n = typeof c.turno === "number" ? c.turno : Number(c.turno);
  const enSuTurno = turnos.find((t) => t.n === n);
  const t = enSuTurno && paraComparar(enSuTurno.texto).includes(buscada) ? enSuTurno : turnos.find((x) => paraComparar(x.texto).includes(buscada));
  if (!t) return null;
  return { turno: t.n, hablante: t.hablante, texto: extraerDelTurno(t.texto, c.texto) ?? c.texto.trim().slice(0, 400) };
}

/**
 * El pedazo del turno que corresponde a la cita, con la ortografía de la TRANSCRIPCIÓN (tildes, eñes y signos de
 * pregunta incluidos): «el año que viene, ¿no hay presupuesto?» no puede mostrarse como «el ano que viene no hay
 * presupuesto». Se normaliza el turno letra por letra recordando de qué letra original sale cada una.
 */
export function extraerDelTurno(turno: string, cita: string): string | null {
  let norm = "";
  const origen: number[] = [];
  for (let i = 0; i < turno.length; i++) {
    const pieza = paraComparar(turno[i]) || " ";
    for (const ch of pieza) {
      if (ch === " " && (norm.endsWith(" ") || norm === "")) continue;
      norm += ch;
      origen.push(i);
    }
  }
  const buscada = paraComparar(cita);
  const desde = norm.indexOf(buscada);
  if (desde < 0 || !buscada) return null;
  const inicio = origen[desde];
  const fin = origen[desde + buscada.length - 1] + 1;
  // Hasta el final de la palabra y con el signo que la cierra, si lo hay.
  const resto = /^[\p{L}\p{N}]*[?!.…»”"]?/u.exec(turno.slice(fin))?.[0] ?? "";
  const abre = /[¿¡«“"]$/.test(turno.slice(0, inicio)) ? 1 : 0;
  return turno.slice(inicio - abre, fin + resto.length).trim().slice(0, 400);
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Lo que tenía el material: un juicio de «sin guía» con guía (o al revés) no vale. */
export interface LoQueHabia {
  guia: boolean;
  escala: boolean;
  posicionamiento: boolean;
  /** Había algo que explorar en el alcance de la sesión (lib/analizador-venta/alcance.ts). Sin el dato, `escala`. */
  dimensiones?: boolean;
}

/** ¿El valor contradice lo que tenía el material? */
function contradiceElMaterial(punto: PuntoJuzgado, valor: string, habia: LoQueHabia): boolean {
  if (punto === "guia") return habia.guia === (valor === "sin_guia");
  if (punto === "escala") return habia.escala === (valor === "sin_escala");
  if (punto === "posicionamiento") return habia.posicionamiento === (valor === "sin_posicionamiento");
  if (punto === "exploracion") return !(habia.dimensiones ?? habia.escala);

  return false;
}

/**
 * Lee lo que devolvió el modelo y deja solo lo verificable. `descartados`: los juicios sin ninguna cita que aparezca en
 * la transcripción, con un punto o un valor que no existe, o que contradicen lo que tenía el material («sin guía» con
 * guía). Un juicio por ausencia («se saltó», «sin explorar») vale sin cita SOLO si el modelo no dio ninguna: si dio una y
 * no está en la transcripción, inventó la prueba y se descarta.
 */
export function leerElAnalisis(
  crudo: unknown,
  turnos: readonly TurnoNumerado[],
  habia: LoQueHabia = { guia: true, escala: true, posicionamiento: true },
): { resultado: ResultadoDelAnalisis; descartados: number } {
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as { resumen?: unknown; juicios?: unknown; recomendaciones?: unknown };
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
    const dadas = Array.isArray(x.citas) ? x.citas : [];
    const citas = dadas.map((c) => verificarCita((c ?? {}) as { turno?: unknown; texto?: unknown }, turnos)).filter((c): c is Cita => !!c);
    const porAusencia = POR_AUSENCIA[punto].includes(valor) && dadas.length === 0;
    if (!citas.length && !porAusencia) {
      descartados++;
      continue;
    }
    juicios.push({ punto, etapa, dimension: punto === "exploracion" ? texto(x.dimension, 120) || null : null, valor, lectura, citas: citas.slice(0, 3), porAusencia });
  }
  const recomendaciones: Recomendacion[] = (Array.isArray(o.recomendaciones) ? o.recomendaciones : [])
    .map((r) => (r && typeof r === "object" ? r : {}) as Record<string, unknown>)
    .map((r) => ({
      texto: texto(r.texto, 500),
      citas: (Array.isArray(r.citas) ? r.citas : []).map((c) => verificarCita((c ?? {}) as { turno?: unknown; texto?: unknown }, turnos)).filter((c): c is Cita => !!c).slice(0, 2),
    }))
    .filter((r) => r.texto)
    .slice(0, 3);
  return { resultado: { resumen: texto(o.resumen, 800), juicios, recomendaciones }, descartados };
}

/** El resultado guardado, leído tolerante (un Json raro es «sin análisis»). */
export function leerResultadoGuardado(v: unknown): ResultadoDelAnalisis | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Partial<ResultadoDelAnalisis>;
  if (typeof o.resumen !== "string" || !Array.isArray(o.juicios) || !Array.isArray(o.recomendaciones)) return null;
  return { resumen: o.resumen, juicios: o.juicios, recomendaciones: o.recomendaciones };
}
