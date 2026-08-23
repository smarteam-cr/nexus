/**
 * lib/ventas/sicop-notas.ts — LEER LAS NOTAS DEL SCRAPER SIN CREERLE EL FORMATO.
 *
 * El scraper de SICOP no escribe propiedades: escribe NOTAS, y algunas traen datos
 * estructurados en prosa. Hoy se conocen tres formas:
 *
 *   «Análisis del filtro»            → Decisión · Score · Confianza · Razón
 *   «Detalles del procedimiento»     → Monto estimado · Tipo · Fecha límite de aclaraciones ·
 *                                      Fecha y admisibilidad del recurso de objeción · Multas
 *   una nota sin texto con un archivo → el cartel en PDF
 *
 * Score y Confianza son lo que PRIORIZA la pantalla, así que sacarlos bien no es cosmético.
 *
 * ── POR QUÉ ESTO ES TOLERANTE Y NO UN PARSER PEGADO AL FORMATO ───────────────
 * El scraper está en desarrollo. El 2026-08-23 creó tres tickets a las 06:35 y para las 07:20
 * ya los había BORRADO; ese mismo día no quedaba en el portal ni una nota «Detalles del
 * procedimiento», y la única «Análisis del filtro» viva usa un vocabulario distinto
 * (`Decisión: relevant`, `Score: 0.8`) del que se especificó (`high_confidence`, `Score: 1`).
 * Un parser pegado a una de las dos versiones se rompe con la otra.
 *
 * De ahí las tres reglas:
 *  ⛔ NADA SE DESCARTA. Todo par «Etiqueta: valor» encontrado queda en `campos`, lo reconozca
 *     o no. Una nota cuya clase no se reconoce se muestra igual, cruda.
 *  ⛔ EL DRIFT SE VE. Si una nota se anuncia como «Análisis del filtro» pero le falta el
 *     Score, queda marcada en `faltantes` y la pantalla lo dice. Un parser que devuelve null
 *     en silencio convierte un cambio de formato en «no hay licitaciones priorizadas», que se
 *     lee como que no hay trabajo.
 *  ⚠ LOS DOS VOCABULARIOS CONVIVEN. `decision` guarda la palabra cruda del scraper; la
 *     normalización es un agregado, no un reemplazo.
 *
 * PURO y SIN UNA SOLA DEPENDENCIA: ni red, ni base, ni IA. No es casualidad — la pantalla lo
 * importa como VALOR, y bastaría con que este archivo tocara `sicop-lectura.ts` para arrastrar
 * el SDK de Anthropic al bundle del navegador. Por eso `aTextoPlano` vive acá (convertir una
 * NOTA de HTML a texto es una operación sobre notas) y `sicop-lectura.ts` la importa de este
 * lado, no al revés. Se prueba entero en `sicop-notas.test.ts`.
 */

/** HTML de HubSpot → texto plano. Las notas vienen como `<div><p>…</p></div>`. */
export function aTextoPlano(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type ClaseDeNota = "FILTRO" | "PROCEDIMIENTO" | "ARCHIVO" | "HUMANA";

/** Un par «Etiqueta: valor» tal como estaba escrito, más su forma comparable. */
export interface CampoDeNota {
  etiqueta: string;
  /** Minúsculas, sin acentos y con espacios colapsados — para comparar sin adivinar. */
  clave: string;
  valor: string;
}

/** Cómo llama el scraper a su veredicto, normalizado sin perder la palabra original. */
export type VeredictoDelScraper = "RELEVANTE" | "DUDA" | "DESCARTE" | "OTRO";

export interface FiltroDelScraper {
  /** La palabra CRUDA: "high_confidence", "relevant", "doubt"… Nunca se pisa. */
  decision: string | null;
  veredicto: VeredictoDelScraper;
  /** 0-100. Ver `aPuntaje` para la ambigüedad conocida del valor `1`. */
  score: number | null;
  confianza: number | null;
  razon: string | null;
  /** La taxonomía del scraper ("track_hosting"). Se conserva aunque Nexus no la use todavía. */
  track: string | null;
}

export interface DatosDelProcedimiento {
  montoEstimado: number | null;
  tipoProcedimiento: string | null;
  /** ISO completo tal como vino ("2026-08-24T23:59:00-06:00"). */
  fechaAclaraciones: string | null;
  fechaObjecion: string | null;
  admisibilidadObjecion: string | null;
  multas: string | null;
}

export interface NotaClasificada {
  id: string;
  creadaEl: string | null;
  autor: string | null;
  clase: ClaseDeNota;
  /** El cuerpo en texto plano. Se muestra siempre, entienda o no la estructura. */
  texto: string;
  adjuntos: number;
  campos: CampoDeNota[];
  filtro: FiltroDelScraper | null;
  procedimiento: DatosDelProcedimiento | null;
  /** Campos que la clase promete y no aparecieron. Vacío = la nota vino completa. */
  faltantes: string[];
}

/** Lo que la nota trae antes de clasificarse (lo que devuelve `leerNotasDeTickets`). */
export interface NotaCrudaParaLeer {
  id: string;
  creadaEl: string | null;
  cuerpo: string;
  adjuntos?: number;
  /** Id del owner de HubSpot; el nombre lo resuelve el llamador. */
  autor?: string | null;
}

// ── Normalización de etiquetas ─────────────────────────────────────────────────

/**
 * Minúsculas, sin acentos, sin markdown, espacios colapsados.
 *
 * ⚠ El guion bajo se quita SOLO en los bordes. Sacarlo de adentro rompía los valores en
 * snake_case que usa el scraper: `high_confidence` quedaba `highconfidence` y dejaba de
 * matchear su propio vocabulario, así que el veredicto más importante que emite —el de alta
 * confianza— caía a «OTRO» sin que nada fallara. Lo mismo con `track_hosting`.
 */
export function clavear(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[*#`]/g, "")
    .replace(/^_+|_+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sinónimos por campo. Es una LISTA y no una regex por dos motivos medidos: el scraper ya
 * escribió «Análisis del filtro» y «Análisis de filtro» (y una vez «fittro»), y el nombre
 * largo de las fechas cambia de tanto en tanto. Sumar una variante acá es una línea.
 */
const SINONIMOS: Record<string, readonly string[]> = {
  decision: ["decision"],
  score: ["score", "puntaje"],
  confianza: ["confianza", "confidence"],
  razon: ["razon", "motivo", "justificacion"],
  montoEstimado: ["monto estimado", "monto", "presupuesto estimado", "presupuesto"],
  tipoProcedimiento: ["tipo de procedimiento", "tipo procedimiento", "tipo de contratacion"],
  fechaAclaraciones: [
    "fecha limite de aclaraciones",
    "fecha de recepcion de aclaraciones",
    "limite de aclaraciones",
    "aclaraciones",
  ],
  fechaObjecion: [
    "fecha limite de recurso de objecion",
    "fecha limite de objecion",
    "limite de objecion",
  ],
  admisibilidadObjecion: [
    "admisibilidad del recurso de objecion",
    "admisibilidad de objecion",
    "admisibilidad",
  ],
  multas: ["multas", "clausula penal", "sanciones"],
};

function buscar(campos: readonly CampoDeNota[], nombre: keyof typeof SINONIMOS): string | null {
  const alias = SINONIMOS[nombre];
  for (const a of alias) {
    const hit = campos.find((c) => c.clave === a);
    if (hit) return hit.valor;
  }
  // Segunda pasada, más floja: la etiqueta CONTIENE el alias ("Fecha límite de aclaraciones (SICOP)").
  for (const a of alias) {
    const hit = campos.find((c) => c.clave.includes(a));
    if (hit) return hit.valor;
  }
  return null;
}

// ── Extracción de campos ───────────────────────────────────────────────────────

/** Quita el markdown de encabezado/énfasis de una línea, sin tocar el contenido. */
function sinMarkdown(linea: string): string {
  return linea
    .replace(/^\s*[#>]+\s*/, "")
    .replace(/^\s*[-*•]\s+/, "")
    .replace(/\*\*/g, "")
    .trim();
}

/**
 * ¿Esta etiqueta es de verdad una etiqueta? El riesgo son las líneas que llevan dos puntos sin
 * ser un campo: una URL (`https://…`) y —la que apareció de verdad— un timestamp suelto como
 * `_2026-08-21T19:34:41.299Z_`, que sin guarda produce el campo «_2026-08-21T19».
 */
function pareceEtiqueta(bruta: string): boolean {
  const e = bruta.trim();
  if (!e || e.length > 60) return false;
  const limpia = e.replace(/[*#`]/g, "").replace(/^_+|_+$/g, "").trim();
  if (!limpia) return false;
  if (/^\d/.test(limpia)) return false; // arranca con número → fecha u hora, no etiqueta
  return /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(limpia);
}

/**
 * Saca todos los pares «Etiqueta: valor» del texto, en orden de aparición.
 *
 * ⚠ Los valores MULTILÍNEA se acumulan. «Razón:» y «Multas:» se desbordan varias líneas, y
 * cortar en el salto dejaba la razón mutilada justo donde explica por qué la licitación
 * importa. Una línea nueva solo cierra el campo anterior si ella misma es un campo.
 */
export function extraerCampos(texto: string): CampoDeNota[] {
  const salida: CampoDeNota[] = [];
  let abierto: CampoDeNota | null = null;

  for (const cruda of texto.split(/\r?\n/)) {
    const linea = sinMarkdown(cruda);
    if (!linea) continue;

    const dosPuntos = linea.indexOf(":");
    /* ⚠ El `://` se mira DESPUÉS de los dos puntos, no dentro de la etiqueta. En
       "Ver https://sicop.go.cr" el primer `:` es el del esquema y la etiqueta ("Ver https")
       parece perfectamente válida — así se colaba una URL como si fuera un campo. Mirando lo
       que sigue, "Enlace: https://…" SÍ sigue siendo un campo, que es lo correcto. */
    const esEsquemaDeUrl = linea.slice(dosPuntos, dosPuntos + 3) === "://";
    if (dosPuntos > 0 && !esEsquemaDeUrl) {
      const etiqueta = linea.slice(0, dosPuntos).trim();
      if (pareceEtiqueta(etiqueta)) {
        abierto = {
          etiqueta: etiqueta.replace(/[*#`]/g, "").replace(/^_+|_+$/g, "").trim(),
          clave: clavear(etiqueta),
          valor: linea.slice(dosPuntos + 1).trim(),
        };
        salida.push(abierto);
        continue;
      }
    }

    if (abierto) abierto.valor = `${abierto.valor} ${linea}`.trim();
  }

  return salida;
}

// ── Normalización de valores ───────────────────────────────────────────────────

/**
 * Un puntaje del scraper a 0-100. Acepta `0.95`, `0,95`, `95`, `95%` y `1`.
 *
 * ⚠ AMBIGÜEDAD CONOCIDA: `1` se lee como 100, no como 1%. Todos los valores observados en el
 * portal viven en escala 0-1 (0.3 · 0.55 · 0.8 · 0.85 · 0.95 · 1), así que un `1` es el
 * máximo. Si el scraper migrara a escala 0-100, un puntaje de 1 se leería como 100 — por eso
 * el valor crudo queda igual en `campos` y esta nota existe.
 */
export function aPuntaje(v: string | null | undefined): number | null {
  if (!v) return null;
  const limpio = v.replace(/%/g, "").replace(",", ".").trim();
  const n = Number(limpio.split(/\s/)[0]);
  if (!Number.isFinite(n) || n < 0) return null;
  const escalado = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(escalado)));
}

/** Un monto a número. Acepta `3800000`, `₡3.800.000`, `3,800,000`, `USD 12 500`. */
export function aMonto(v: string | null | undefined): number | null {
  if (!v) return null;
  const soloNumero = v.replace(/[^\d.,]/g, "").trim();
  if (!soloNumero) return null;
  /* Separadores de miles: se quitan los puntos y comas que NO son el decimal. Un monto de
     licitación no tiene centavos que cambien nada, así que ante la duda se toma la parte
     entera en vez de inventar una coma decimal. */
  const sinSeparadores = soloNumero.replace(/[.,](?=\d{3}\b)/g, "").replace(/,/g, ".");
  const n = Number(sinSeparadores);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Deja la fecha como vino si es una ISO reconocible; si no, null (el crudo sigue en `campos`). */
export function aFechaIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = v.trim().match(/\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/);
  if (!m) return null;
  const iso = m[0].replace(" ", "T");
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

const VEREDICTOS: { veredicto: VeredictoDelScraper; palabras: readonly string[] }[] = [
  { veredicto: "RELEVANTE", palabras: ["high_confidence", "relevant", "relevante", "alta", "si", "match"] },
  { veredicto: "DUDA", palabras: ["doubt", "dudoso", "duda", "medium", "media", "low_confidence"] },
  { veredicto: "DESCARTE", palabras: ["discard", "descarte", "descartar", "irrelevant", "irrelevante", "no"] },
];

export function aVeredicto(decision: string | null): VeredictoDelScraper {
  if (!decision) return "OTRO";
  const d = clavear(decision);
  for (const { veredicto, palabras } of VEREDICTOS) {
    if (palabras.some((p) => d === p || d.startsWith(`${p} `) || d.includes(p))) return veredicto;
  }
  return "OTRO";
}

// ── Clasificación ──────────────────────────────────────────────────────────────

const ES_FILTRO = /an[aá]lisis\s+d[eo]l?\s+(filtro|fittro|f[il]tro)/i;
const ES_PROCEDIMIENTO = /detalles?\s+del\s+procedimiento/i;

export function clasificar(texto: string, adjuntos: number): ClaseDeNota {
  if (ES_FILTRO.test(texto)) return "FILTRO";
  if (ES_PROCEDIMIENTO.test(texto)) return "PROCEDIMIENTO";
  if (!texto.trim() && adjuntos > 0) return "ARCHIVO";
  return "HUMANA";
}

/** Lo que cada clase PROMETE traer. Lo que falte se reporta en `faltantes`. */
const PROMESAS: Partial<Record<ClaseDeNota, { campo: keyof typeof SINONIMOS; label: string }[]>> = {
  FILTRO: [
    { campo: "decision", label: "Decisión" },
    { campo: "score", label: "Score" },
    { campo: "confianza", label: "Confianza" },
    { campo: "razon", label: "Razón" },
  ],
  PROCEDIMIENTO: [
    { campo: "montoEstimado", label: "Monto estimado" },
    { campo: "tipoProcedimiento", label: "Tipo de procedimiento" },
    { campo: "fechaAclaraciones", label: "Fecha límite de aclaraciones" },
  ],
};

// ── La lectura ─────────────────────────────────────────────────────────────────

/** Clasifica UNA nota y le saca lo que se pueda, sin perder nada de lo que no entiende. */
export function leerNota(nota: NotaCrudaParaLeer, autor: string | null = null): NotaClasificada {
  const texto = aTextoPlano(nota.cuerpo);
  const adjuntos = nota.adjuntos ?? 0;
  const clase = clasificar(texto, adjuntos);
  const campos = extraerCampos(texto);

  let filtro: FiltroDelScraper | null = null;
  if (clase === "FILTRO") {
    const decision = buscar(campos, "decision");
    const razon = buscar(campos, "razon");
    filtro = {
      decision,
      veredicto: aVeredicto(decision),
      score: aPuntaje(buscar(campos, "score")),
      confianza: aPuntaje(buscar(campos, "confianza")),
      razon,
      // El track puede venir en la razón o suelto; se busca en TODO el texto.
      track: texto.match(/\btrack_([a-z0-9_]+)/i)?.[0] ?? null,
    };
  }

  let procedimiento: DatosDelProcedimiento | null = null;
  if (clase === "PROCEDIMIENTO") {
    procedimiento = {
      montoEstimado: aMonto(buscar(campos, "montoEstimado")),
      tipoProcedimiento: buscar(campos, "tipoProcedimiento"),
      fechaAclaraciones: aFechaIso(buscar(campos, "fechaAclaraciones")),
      fechaObjecion: aFechaIso(buscar(campos, "fechaObjecion")),
      admisibilidadObjecion: buscar(campos, "admisibilidadObjecion"),
      multas: buscar(campos, "multas"),
    };
  }

  const faltantes = (PROMESAS[clase] ?? [])
    .filter(({ campo }) => buscar(campos, campo) === null)
    .map(({ label }) => label);

  return {
    id: nota.id,
    creadaEl: nota.creadaEl,
    autor,
    clase,
    texto,
    adjuntos,
    campos,
    filtro,
    procedimiento,
    faltantes,
  };
}

// ── El resumen de la licitación ────────────────────────────────────────────────

export interface ResumenDeNotas {
  notas: NotaClasificada[];
  /** El filtro MÁS NUEVO. Es lo que prioriza la pantalla. */
  filtro: FiltroDelScraper | null;
  /** Los datos del procedimiento MÁS NUEVOS. */
  procedimiento: DatosDelProcedimiento | null;
  conTexto: number;
  archivos: number;
  /** Notas que dicen ser de una clase conocida pero les falta algo. Se muestra el aviso. */
  incompletas: number;
}

/**
 * Junta las notas de un ticket en el resumen que consume la tabla.
 *
 * ⚠ Gana la nota MÁS NUEVA, no la primera. El scraper vuelve a correr sobre el mismo
 * procedimiento cuando cambia el cartel, y la corrección llega como una nota nueva: quedarse
 * con la vieja mostraría un monto o una fecha que ya no rige.
 */
export function resumirNotas(
  notas: readonly NotaCrudaParaLeer[],
  autores: ReadonlyMap<string, string> = new Map(),
): ResumenDeNotas {
  const leidas = notas
    .map((n) => leerNota(n, n.autor ? (autores.get(n.autor) ?? null) : null))
    .sort((a, b) => (b.creadaEl ?? "").localeCompare(a.creadaEl ?? ""));

  return {
    notas: leidas,
    filtro: leidas.find((n) => n.filtro)?.filtro ?? null,
    procedimiento: leidas.find((n) => n.procedimiento)?.procedimiento ?? null,
    conTexto: leidas.filter((n) => n.texto.trim().length > 0).length,
    archivos: leidas.reduce((n, x) => n + x.adjuntos, 0),
    incompletas: leidas.filter((n) => n.faltantes.length > 0).length,
  };
}

/** La etiqueta de archivos de una nota, tal como la pide la pantalla. */
export function etiquetaDeArchivos(adjuntos: number): string {
  if (adjuntos === 0) return "Sin archivos";
  if (adjuntos === 1) return "1 archivo adjunto";
  return `${adjuntos} archivos adjuntos`;
}

/** El rótulo humano de la clase, para la pantalla. */
export const CLASE_LABEL: Record<ClaseDeNota, string> = {
  FILTRO: "Análisis del filtro",
  PROCEDIMIENTO: "Datos del procedimiento",
  ARCHIVO: "Archivo del cartel",
  HUMANA: "Nota del equipo",
};
