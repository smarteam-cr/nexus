/**
 * lib/timeline/particularidades-summary.ts
 *
 * Resumen con ATRIBUCIÓN de las particularidades (desviaciones curadas) — funciones PURAS,
 * client-safe (sin Prisma). Lo central es la atribución acumulada del corrimiento, no la prosa:
 * *"N semanas de corrimiento acumulado: X compartidas, Y del cliente y Z de Smarteam."*
 *
 * Genérico sobre la forma de la particularidad (solo necesita party + weeksImpact) para servir a
 * las DOS vistas sin duplicar la matemática: interna (Particularidad de Prisma) y externa
 * (ExternalParticularidad del snapshot). La matemática es única; el render se hace dos veces.
 *
 * INVARIANTE: la suma de los buckets de `byParty` es SIEMPRE igual a `totalWeeks`. Antes no lo era
 * —un `party` fuera de la lista sumaba al total y a ningún bucket—, así que el titular podía decir
 * "6 semanas" y el desglose mostrar 1. Esas semanas ahora caen en `SIN_ATRIBUIR` y se dicen.
 *
 * La frase se RECALCULA en cada lectura (en `publishedSnapshot` se congela la data cruda, no el
 * texto): cambiar la redacción acá corrige retroactivamente lo ya publicado, sin republicar.
 */

/** Lo mínimo que el resumen necesita de una particularidad. */
export interface ParticularidadLike {
  party: string; // CLIENTE | SMARTEAM | AMBOS | DEV
  weeksImpact?: number | null;
}

/** Parties válidos que puede traer una particularidad. */
const KNOWN_PARTIES = ["CLIENTE", "SMARTEAM", "AMBOS", "DEV"] as const;

/**
 * Buckets de atribución = los parties válidos + SIN_ATRIBUIR (party desconocido/corrupto), que
 * existe para que el desglose cierre contra el total por construcción.
 * El orden de este array es el DESEMPATE al redactar (cuando dos buckets tienen las mismas semanas).
 */
export const ATTRIBUTION_BUCKETS = ["AMBOS", "CLIENTE", "SMARTEAM", "DEV", "SIN_ATRIBUIR"] as const;
export type AttributionBucket = (typeof ATTRIBUTION_BUCKETS)[number];

export interface ParticularidadesSummary {
  /** ¿Hay al menos una particularidad? (para decidir si renderizar el bloque). */
  count: number;
  /** Suma total de weeksImpact (semanas de corrimiento acumulado). */
  totalWeeks: number;
  /** Corrimiento atribuido por responsable. Suma exactamente `totalWeeks`. */
  byParty: Record<AttributionBucket, number>;
}

/**
 * Suma weeksImpact por party sobre las particularidades dadas (ya filtradas a las visibles por el
 * caller). weeksImpact null/negativo se trata como 0 (una desviación sin impacto de fechas cuenta
 * para la bitácora pero no para el corrimiento). Un `party` desconocido cae en SIN_ATRIBUIR: sus
 * semanas se cuentan y se muestran como no atribuidas, en vez de desaparecer del desglose.
 */
export function summarizeParticularidades(parts: ParticularidadLike[]): ParticularidadesSummary {
  const byParty: Record<AttributionBucket, number> = {
    AMBOS: 0, CLIENTE: 0, SMARTEAM: 0, DEV: 0, SIN_ATRIBUIR: 0,
  };
  let totalWeeks = 0;
  for (const p of parts) {
    const w = typeof p.weeksImpact === "number" && p.weeksImpact > 0 ? p.weeksImpact : 0;
    totalWeeks += w;
    const bucket: AttributionBucket = (KNOWN_PARTIES as readonly string[]).includes(p.party)
      ? (p.party as AttributionBucket)
      : "SIN_ATRIBUIR";
    byParty[bucket] += w;
  }
  return { count: parts.length, totalWeeks, byParty };
}

/** Pluraliza "semana(s)". */
function semanas(n: number): string {
  return `${n} ${n === 1 ? "semana" : "semanas"}`;
}

/** Etiqueta de cada bucket. La unidad ("semanas") va una sola vez en el titular. */
const BUCKET_LABEL: Record<AttributionBucket, string> = {
  AMBOS: "compartidas",
  CLIENTE: "del cliente",
  SMARTEAM: "de Smarteam",
  DEV: "de desarrollo",
  SIN_ATRIBUIR: "sin atribuir",
};

/** Une en español: "a", "a y b", "a, b y c". */
function joinEs(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export interface AttributionOptions {
  /**
   * A quién le habla la frase. Cambia el CONTENIDO, no solo el tono:
   * - "interno": desglose completo por responsable (es la cobertura del CSE).
   * - "cliente": SIN reparto de responsables. El cliente lee qué pasó y cuándo terminamos; el
   *   marcador de faltas no le sirve y pone la relación a la defensiva.
   */
  audience?: "interno" | "cliente";
  /**
   * Fecha de cierre proyectada, ya formateada (ej. "15 sep 2026"). Solo se usa con audiencia
   * "cliente": es lo que convierte un número de atraso en un compromiso. Un atraso sin fecha nueva
   * es ansiedad sin salida.
   */
  closingDate?: string | null;
}

/**
 * Frase de atribución en lenguaje cliente. null si no hay corrimiento acumulado (totalWeeks 0):
 * el caller decide si igual muestra la bitácora.
 *
 * Los buckets van de MAYOR a MENOR: el grueso del corrimiento se lee primero, así la frase no se
 * lee como "y las demás semanas dónde están". Todos los buckets se redactan igual (número +
 * etiqueta) y el desglose siempre suma el titular.
 *
 * Ej: *"7 semanas de corrimiento acumulado: 5 compartidas, 1 del cliente y 1 de Smarteam."*
 */
export function attributionSentence(
  s: ParticularidadesSummary,
  opts: AttributionOptions = {},
): string | null {
  if (s.totalWeeks <= 0) return null;

  // ── Cliente: qué pasó + cuándo terminamos. Sin reparto de responsables. ──
  if (opts.audience === "cliente") {
    const movio = `El plan se movió ${semanas(s.totalWeeks)}.`;
    return opts.closingDate ? `${movio} Nueva fecha de cierre: ${opts.closingDate}.` : movio;
  }

  // ── Interno: desglose completo. "corrimiento" es vocabulario de equipo, acá se queda. ──
  const items = ATTRIBUTION_BUCKETS.filter((b) => s.byParty[b] > 0)
    .sort((a, b) => s.byParty[b] - s.byParty[a] || ATTRIBUTION_BUCKETS.indexOf(a) - ATTRIBUTION_BUCKETS.indexOf(b))
    .map((b) => `${s.byParty[b]} ${BUCKET_LABEL[b]}`);
  const head = `${semanas(s.totalWeeks)} de corrimiento acumulado`;
  return items.length > 0 ? `${head}: ${joinEs(items)}.` : `${head}.`;
}
