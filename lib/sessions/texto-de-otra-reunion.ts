/**
 * lib/sessions/texto-de-otra-reunion.ts — ¿el texto (o la minuta) de una reunión es de OTRA reunión?
 * PURO. Lo usa el script de limpieza (scripts/limpiar-analisis-de-otra-reunion.ts) y sus pruebas.
 *
 * Dos preguntas distintas, con dos señales distintas (medidas en producción el 2026-10-05):
 *
 * 1. ¿La TRANSCRIPCIÓN guardada es de esta reunión? Las notas de Gemini abren con
 *    «<título de la reunión> - Transcripción». Si ese título es otro, el texto es de otra reunión
 *    (101 de las 169 reuniones que se llenaron desde la búsqueda en Drive). Si no hay encabezado y la
 *    primera línea tampoco es el título, no es la transcripción de una reunión (25: contratos, briefs).
 *    Y si el texto es idéntico al de otra reunión de otro título u otro día, es de esa otra (30: las
 *    series diarias que se quedaron con el texto de otro día).
 *
 * 2. ¿La MINUTA se escribió con el texto de esta reunión? La minuta no guarda de qué texto salió:
 *    se compara con el texto de HOY y con el de las reuniones de esos días. Las palabras que pesan
 *    son las raras (nombres de personas, de productos, de empresas: idf alto); las de todos los días
 *    («hubspot», «reunión») casi no pesan. Si otra reunión explica la minuta claramente mejor que la
 *    propia Y la búsqueda vieja en Drive la habría tomado (su nombre tenía las mismas dos primeras
 *    palabras de 4+ letras), la minuta salió de esa otra reunión. Sobre las 103 minutas escritas antes
 *    del último cambio de texto: 27 de otra reunión (entre ellas CAV↔Honda, ICB↔Cayalá, Total
 *    Finco↔Metzger y el kickoff de RC Inmobiliaria con el de STLA), 20 dudosas y 56 de la misma reunión
 *    con un documento más completo.
 */
import { mismoTitulo, tituloComparable } from "@/lib/google/drive-candidatos";

// ── 1. La procedencia de una transcripción ─────────────────────────────────────────────────────

export type Procedencia =
  | { tipo: "propia" }
  | { tipo: "otra-reunion"; encabezado: string }
  | { tipo: "no-es-una-reunion"; primeraLinea: string };

const RE_ENCABEZADO = /^(.*\S)\s+-\s+(?:Transcripción|Transcripcion|Transcript|Transcrição)\s*$/i;

/** De qué reunión es una transcripción, según su primera línea. */
export function procedenciaDelTexto(titulo: string, texto: string): Procedencia {
  const primeraLinea = (texto.split(/\r?\n/, 1)[0] ?? "").trim();
  const m = RE_ENCABEZADO.exec(primeraLinea);
  if (m) return mismoTitulo(titulo, m[1]) ? { tipo: "propia" } : { tipo: "otra-reunion", encabezado: m[1] };
  // Notas sin pestaña de transcripción: el cuerpo abre con el título de la reunión.
  if (primeraLinea && tituloComparable(primeraLinea) === tituloComparable(titulo)) return { tipo: "propia" };
  return { tipo: "no-es-una-reunion", primeraLinea: primeraLinea.slice(0, 120) };
}

/** Dos eventos con el mismo título a menos de esto son la MISMA reunión (un evento duplicado). */
export const MISMA_REUNION_MS = 12 * 3_600_000;

export interface ReunionConTexto {
  id: string;
  title: string;
  date: Date;
  /** ¿El texto le llegó por su documento adjunto (y no por la búsqueda en Drive)? */
  conDoc: boolean;
}

/**
 * Una reunión llenada desde Drive cuyo texto es IDÉNTICO al de otra: ¿de cuál es ese texto? Si la otra
 * es la misma reunión (mismo título, a menos de 12 h: un evento duplicado), es suyo y devuelve null. Si
 * es otra reunión (otro título, u otro día de la serie), devuelve esa otra: la que tiene el documento
 * adjunto si alguna lo tiene. Así se ven las diarias que se quedaron con el texto de otro día.
 */
export function copiaDeOtraReunion(reunion: ReunionConTexto, conElMismoTexto: readonly ReunionConTexto[]): ReunionConTexto | null {
  const otras = conElMismoTexto.filter(
    (x) =>
      x.id !== reunion.id &&
      (!mismoTitulo(reunion.title, x.title) || Math.abs(x.date.getTime() - reunion.date.getTime()) > MISMA_REUNION_MS),
  );
  if (otras.length === 0) return null;
  return otras.find((x) => x.conDoc) ?? otras[0];
}

// ── 2. ¿De qué reunión salió una minuta? ───────────────────────────────────────────────────────

// Palabras de 4+ letras que aparecen en casi cualquier minuta del equipo. El idf ya las baja; la
// lista solo evita que una coincidencia trivial empate una comparación.
const COMUNES = new Set(
  (
    "para pero como esta este esto estos estas sobre entre desde hasta donde cuando porque tambien solo cada todo " +
    "todos todas otra otro otros otras puede pueden debe deben sera seran tiene tienen hacer hace parte forma manera " +
    "sesion reunion cliente clientes equipo smarteam hubspot proceso procesos semana dias proximo proxima siguiente " +
    "siguientes pasos accion acciones revisar enviar confirmar definir realizar tener quedo queda quedan hubo sido " +
    "estar haber with that this from have will they their"
  ).split(" "),
);

/** Las palabras de un texto que sirven para compararlo: sin tildes, de 4+ letras, sin números ni comunes. */
export function palabrasDistintivas(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !COMUNES.has(w));
}

export interface IndiceDeTextos {
  conjuntos: Map<string, Set<string>>;
  /** En cuántos textos aparece cada palabra. */
  apariciones: Map<string, number>;
  total: number;
}

/** El índice de los textos contra los que se compara (los de un período). */
export function indexarTextos(textos: Iterable<{ id: string; texto: string }>): IndiceDeTextos {
  const conjuntos = new Map<string, Set<string>>();
  const apariciones = new Map<string, number>();
  for (const t of textos) {
    const c = new Set(palabrasDistintivas(t.texto));
    conjuntos.set(t.id, c);
    for (const w of c) apariciones.set(w, (apariciones.get(w) ?? 0) + 1);
  }
  return { conjuntos, apariciones, total: conjuntos.size };
}

function peso(indice: IndiceDeTextos, palabra: string): number {
  return Math.log((indice.total + 1) / ((indice.apariciones.get(palabra) ?? 0) + 1));
}

/**
 * Qué parte de una minuta explica un texto: la suma del peso de sus palabras que aparecen en ese
 * texto, sobre el peso de todas. Las palabras que no aparecen en ningún texto del índice no cuentan
 * (no dicen nada de cuál es). 0 = nada en común, 1 = todo.
 */
export function cuantoExplica(indice: IndiceDeTextos, palabrasDeLaMinuta: readonly string[], idTexto: string): number {
  const texto = indice.conjuntos.get(idTexto);
  if (!texto) return 0;
  const utiles = [...new Set(palabrasDeLaMinuta)].filter((w) => indice.apariciones.has(w));
  const total = utiles.reduce((s, w) => s + peso(indice, w), 0);
  if (total === 0) return 0;
  return utiles.reduce((s, w) => s + (texto.has(w) ? peso(indice, w) : 0), 0) / total;
}

/**
 * Las palabras con las que buscaba la búsqueda en Drive hasta el 2026-10-05: las dos primeras de 4+
 * letras del título (quitando signos salvo tildes y eñes). Se conserva SOLO para diagnosticar lo que
 * esa búsqueda ya escribió; la búsqueda de hoy vive en lib/google/drive-candidatos.ts.
 */
export function palabrasDeLaBusquedaVieja(titulo: string): string[] {
  return titulo
    .replace(/[^\w\sáéíóúüñÁÉÍÓÚÜÑ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 2);
}

/** ¿La búsqueda vieja habría tomado el archivo de la reunión `otra` para esta? Drive compara por inicio de palabra. */
export function laBusquedaViejaLaTomaba(tituloDeLaReunion: string, tituloDeLaOtra: string): boolean {
  const claves = palabrasDeLaBusquedaVieja(tituloDeLaReunion).map(tituloComparable);
  if (claves.length === 0) return false;
  const palabras = tituloComparable(tituloDeLaOtra).split(" ");
  return claves.every((k) => palabras.some((w) => w.startsWith(k)));
}

export type VeredictoDeMinuta = "otra-reunion" | "dudosa" | "propia";

/** Umbrales medidos sobre las 85 minutas del 2026-10-05 (ver el encabezado). */
export const UMBRALES_DE_MINUTA = { minimoDeLaOtra: 0.35, ventaja: 0.1, propiaBaja: 0.3 } as const;

/**
 * El veredicto: de OTRA reunión si otra la explica claramente mejor que la propia y la búsqueda vieja
 * la tomaba; DUDOSA si la propia la explica poco y no hay otra que la explique mejor (se lista, no se
 * toca); PROPIA en el resto.
 */
export function veredictoDeMinuta(
  propia: number,
  mejorOtra: { explica: number; laBusquedaViejaLaTomaba: boolean } | null,
): VeredictoDeMinuta {
  const u = UMBRALES_DE_MINUTA;
  if (
    mejorOtra &&
    mejorOtra.laBusquedaViejaLaTomaba &&
    mejorOtra.explica >= u.minimoDeLaOtra &&
    mejorOtra.explica - propia >= u.ventaja
  ) {
    return "otra-reunion";
  }
  return propia < u.propiaBaja ? "dudosa" : "propia";
}
