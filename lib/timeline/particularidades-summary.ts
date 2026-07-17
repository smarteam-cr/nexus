/**
 * lib/timeline/particularidades-summary.ts
 *
 * Resumen con ATRIBUCIÓN de las particularidades (desviaciones curadas) — funciones PURAS,
 * client-safe (sin Prisma). Lo central es la atribución acumulada del corrimiento, no la prosa:
 * *"N semanas de corrimiento acumulado. X atribuidas al cliente, Y a Smarteam"*.
 *
 * Genérico sobre la forma de la particularidad (solo necesita party + weeksImpact) para servir a
 * las DOS vistas sin duplicar la matemática: interna (Particularidad de Prisma) y externa
 * (ExternalParticularidad del snapshot). La matemática es única; el render se hace dos veces.
 */

/** Lo mínimo que el resumen necesita de una particularidad. */
export interface ParticularidadLike {
  party: string; // CLIENTE | SMARTEAM | AMBOS | DEV
  weeksImpact?: number | null;
}

export interface ParticularidadesSummary {
  /** ¿Hay al menos una particularidad? (para decidir si renderizar el bloque). */
  count: number;
  /** Suma total de weeksImpact (semanas de corrimiento acumulado). */
  totalWeeks: number;
  /** Corrimiento atribuido por responsable. */
  byParty: { CLIENTE: number; SMARTEAM: number; AMBOS: number; DEV: number };
}

const PARTIES = ["CLIENTE", "SMARTEAM", "AMBOS", "DEV"] as const;
type Party = (typeof PARTIES)[number];

/**
 * Suma weeksImpact por party sobre las particularidades dadas (ya filtradas a las visibles
 * por el caller). weeksImpact null/negativo se trata como 0 (una desviación sin impacto de
 * fechas cuenta para la bitácora pero no para el corrimiento). party desconocido se ignora
 * en byParty pero la particularidad igual cuenta en `count`.
 */
export function summarizeParticularidades(parts: ParticularidadLike[]): ParticularidadesSummary {
  const byParty = { CLIENTE: 0, SMARTEAM: 0, AMBOS: 0, DEV: 0 };
  let totalWeeks = 0;
  for (const p of parts) {
    const w = typeof p.weeksImpact === "number" && p.weeksImpact > 0 ? p.weeksImpact : 0;
    totalWeeks += w;
    if ((PARTIES as readonly string[]).includes(p.party)) {
      byParty[p.party as Party] += w;
    }
  }
  return { count: parts.length, totalWeeks, byParty };
}

/** Pluraliza "semana(s)". */
function semanas(n: number): string {
  return `${n} ${n === 1 ? "semana" : "semanas"}`;
}

/**
 * Frase de atribución en lenguaje cliente. null si no hay corrimiento acumulado (totalWeeks 0):
 * el caller decide si igual muestra la bitácora. Ej: *"3 semanas de corrimiento acumulado.
 * 2 atribuidas al cliente, 1 a Smarteam."*
 */
export function attributionSentence(s: ParticularidadesSummary): string | null {
  if (s.totalWeeks <= 0) return null;
  const parts: string[] = [];
  if (s.byParty.CLIENTE > 0) parts.push(`${semanas(s.byParty.CLIENTE)} atribuida${s.byParty.CLIENTE === 1 ? "" : "s"} al cliente`);
  if (s.byParty.SMARTEAM > 0) parts.push(`${s.byParty.SMARTEAM} a Smarteam`);
  if (s.byParty.AMBOS > 0) parts.push(`${s.byParty.AMBOS} conjunta${s.byParty.AMBOS === 1 ? "" : "s"}`);
  if (s.byParty.DEV > 0) parts.push(`${s.byParty.DEV} de desarrollo`);
  const head = `${semanas(s.totalWeeks)} de corrimiento acumulado.`;
  return parts.length > 0 ? `${head} ${parts.join(", ")}.` : head;
}
