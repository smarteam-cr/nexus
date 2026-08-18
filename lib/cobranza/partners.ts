/**
 * lib/cobranza/partners.ts — la CADENCIA de un aliado comercial, pura.
 *
 * Un aliado no paga todos los meses: HubSpot y Atom Chat pagaron en febrero y en
 * mayo (3 meses de diferencia), Cooby una sola vez en julio. Leer eso mes a mes
 * llena la pantalla de meses vacíos y esconde el ritmo, que es justamente el dato
 * — de ahí la decisión de Elías de que la frecuencia sea del ALIADO.
 *
 * Este archivo agrupa los pagos en BUCKETS del tamaño de esa frecuencia,
 * anclados al año calendario. Cero Prisma, cero red, cero `new Date()`.
 *
 * ⚠ Lo que NO hace: proyectar montos. Sabe DÓNDE cae el próximo período, no
 * cuánto va a entrar — eso nadie lo sabe y ponerle un número sería fabricar.
 */

/** Las cadencias con nombre. Cualquier entero dentro del rango vale igual. */
export const FRECUENCIAS_PARTNER = [
  { meses: 1, label: "Mensual" },
  { meses: 2, label: "Cada 2 meses" },
  { meses: 3, label: "Trimestral" },
  { meses: 4, label: "Cuatrimestral" },
  { meses: 6, label: "Semestral" },
  { meses: 12, label: "Anual" },
] as const;

export const FRECUENCIA_PARTNER_MIN = 1;
/**
 * Techo REAL de lo que el bucketing sabe representar. El CHECK de la base dice
 * 24, pero una cadencia de mas de 12 meses abarcaria varios anios y los buckets
 * estan anclados al anio calendario: con 24, `bucketSiguiente` saltaria UN anio
 * en vez de dos y la etiqueta mentiria. Antes que medio-soportarlo, se deja
 * inalcanzable — el catalogo llega a 12 y el Zod tambien. Si algun dia hace
 * falta una cadencia plurianual, hay que rehacer el anclaje, no subir este numero.
 */
export const FRECUENCIA_PARTNER_MAX = 12;

/** "Trimestral", o "Cada 5 meses" para las que no están en el catálogo. */
export function labelDeFrecuencia(meses: number): string {
  const conocida = FRECUENCIAS_PARTNER.find((f) => f.meses === meses);
  if (conocida) return conocida.label;
  return `Cada ${meses} meses`;
}

const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/**
 * La clave del bucket. El índice va con DOS dígitos a propósito: se ordena como
 * string y con cadencia mensual llega a 11, así que sin el cero "2026-B10" caía
 * ANTES de "2026-B2" y el historial salía con octubre, noviembre y diciembre en
 * el medio. Lo cazó la revisión adversarial; el test B8 lo congela.
 */
function claveDeBucket(anio: number, indice: number): string {
  return `${anio}-B${String(indice).padStart(2, "0")}`;
}

export interface BucketCadencia {
  /** Estable y ordenable como string: "2026-B00", "2026-B01"… */
  clave: string;
  /** Lo que se lee: "ene–mar 2026", "julio 2026", "2026". */
  etiqueta: string;
  anio: number;
  /** Índice del bucket dentro del año (0-based). */
  indice: number;
}

/**
 * En qué bucket cae una fecha, dada la cadencia del aliado.
 *
 * Anclado al AÑO CALENDARIO: con 3 meses, los buckets son ene–mar, abr–jun,
 * jul–sep, oct–dic — o sea trimestres, que es lo que todo el mundo ya entiende.
 * Anclarlo al primer pago en vez del calendario haría que dos aliados con la
 * misma cadencia tuvieran períodos corridos entre sí y ninguna tabla los podría
 * poner lado a lado.
 *
 * Una cadencia que no divide a 12 (5, 7…) deja el último bucket del año corto.
 * Es correcto y se ve: la etiqueta dice hasta diciembre y nada más.
 */
export function bucketDeCadencia(fechaISO: string, frecuenciaMeses: number): BucketCadencia {
  const anio = Number(fechaISO.slice(0, 4));
  const mes = Number(fechaISO.slice(5, 7));
  const n = normalizarFrecuencia(frecuenciaMeses);
  const indice = Math.floor((mes - 1) / n);
  return { clave: claveDeBucket(anio, indice), etiqueta: etiquetaDeBucket(anio, indice, n), anio, indice };
}

/** El bucket que sigue. Es DÓNDE cae el próximo pago, no cuánto va a ser. */
export function bucketSiguiente(b: BucketCadencia, frecuenciaMeses: number): BucketCadencia {
  const n = normalizarFrecuencia(frecuenciaMeses);
  const porAnio = Math.ceil(12 / n);
  const siguiente = b.indice + 1;
  const anio = siguiente >= porAnio ? b.anio + 1 : b.anio;
  const indice = siguiente >= porAnio ? 0 : siguiente;
  return { clave: claveDeBucket(anio, indice), etiqueta: etiquetaDeBucket(anio, indice, n), anio, indice };
}

/**
 * "ene–mar 2026" · "julio 2026" (cadencia mensual) · "2026" (anual).
 * El caso de un solo mes usa el nombre completo: "ene 2026" se lee peor y no
 * ahorra nada cuando no hay un rango del que distinguirlo.
 */
function etiquetaDeBucket(anio: number, indice: number, n: number): string {
  if (n >= 12) return String(anio);
  const desde = indice * n; // 0-based
  const hasta = Math.min(desde + n - 1, 11);
  if (desde > 11) return String(anio);
  if (desde === hasta) return `${nombreLargo(desde)} ${anio}`;
  return `${MESES_CORTOS[desde]}–${MESES_CORTOS[hasta]} ${anio}`;
}

const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function nombreLargo(i: number): string {
  return MESES_LARGOS[i] ?? String(i + 1);
}

/** Fuera de rango se clampea en vez de reventar: el CHECK de la DB ya es el freno. */
function normalizarFrecuencia(meses: number): number {
  if (!Number.isFinite(meses)) return 1;
  return Math.min(FRECUENCIA_PARTNER_MAX, Math.max(FRECUENCIA_PARTNER_MIN, Math.trunc(meses)));
}

export interface PagoDeAliado {
  fecha: string; // ISO
  monto: number;
  moneda: string;
}

export interface TotalDeBucket {
  clave: string;
  etiqueta: string;
  moneda: string;
  total: number;
  cuantos: number;
}

/**
 * Los pagos de UN aliado, agrupados por su cadencia y por moneda.
 *
 * Por moneda separada, como todo el módulo: un aliado que pagara en CRC y en USD
 * dentro del mismo trimestre produce DOS líneas, nunca una convertida.
 * Del bucket más nuevo al más viejo — lo último que entró va arriba.
 */
export function agruparPorCadencia(
  pagos: PagoDeAliado[],
  frecuenciaMeses: number,
): TotalDeBucket[] {
  const acc = new Map<string, TotalDeBucket>();
  for (const p of pagos) {
    const b = bucketDeCadencia(p.fecha, frecuenciaMeses);
    const k = `${b.clave}::${p.moneda}`;
    const prev = acc.get(k);
    if (prev) {
      prev.total = Math.round((prev.total + p.monto) * 100) / 100;
      prev.cuantos += 1;
    } else {
      acc.set(k, {
        clave: b.clave,
        etiqueta: b.etiqueta,
        moneda: p.moneda,
        total: Math.round(p.monto * 100) / 100,
        cuantos: 1,
      });
    }
  }
  return [...acc.values()].sort(
    (a, b) => b.clave.localeCompare(a.clave) || a.moneda.localeCompare(b.moneda),
  );
}
