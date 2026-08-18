/**
 * lib/handoff/session-budget.ts
 *
 * Tanda L (2026-08-09) — cuántas sesiones de VENTAS entran al prompt del handoff, y con
 * cuánto detalle cada una. Reemplaza el corte fijo de "las 10 más recientes" (que en Wherex
 * dejaba afuera el 64% de las sesiones calificadas, sin mirar relevancia) por un presupuesto
 * de caracteres: entran sesiones ordenadas por prioridad hasta llenar el presupuesto, no
 * hasta completar un cupo.
 *
 * Con la fecha de cierre del deal del proyecto (`closeDateMs`), el material se parte en dos
 * narrativas — "antes del cierre" (lo que se vendió/prometió) y "después" (la evolución
 * real) — cada una con su propio presupuesto, para que ninguna le gane espacio a la otra por
 * pura cantidad de reuniones. Sin fecha de cierre resoluble, cae a un solo bloque por
 * recencia (mismo criterio de hoy, con ventana mucho más ancha).
 *
 * Puro: sin Prisma, sin fetch, sin Date.now() implícito (recibe timestamps ya resueltos) —
 * 100% testeable con fixtures. NO decide relevancia (eso sigue siendo `classifyForHandoff` +
 * `linkFeedsHandoff` en session-relevance.ts) — este archivo solo ordena y recorta LO QUE YA
 * pasó esa relevancia.
 */
import { soloOcurridas } from "@/lib/sessions/ocurridas";

export type HandoffSessionBlock = "antes_cierre" | "despues_cierre" | "sin_ancla";

export interface HandoffSessionCandidate {
  id: string;
  title: string;
  date: number; // epoch ms — mismo shape que RawTranscript/ProjectSourceSession
}

export interface HandoffSessionPlanItem {
  id: string;
  block: HandoffSessionBlock;
  /** 0 = la de más detalle dentro de su bloque (la más cercana al cierre, o la más reciente). */
  rank: number;
  /** Cota SUPERIOR a pedirle a fetchTranscriptContent — no el largo real del contenido. */
  maxChars: number;
}

export interface HandoffSessionBudgetConfig {
  beforeBudgetChars: number;
  afterBudgetChars: number;
  /**
   * Cotas por rank, NO-CRECIENTE. El último valor es el piso para todo rank >= length-1.
   * El relleno corta apenas un ítem no entra en lo que queda del presupuesto — es correcto
   * solo porque esta lista nunca crece: si un día se pasa una config con tiers crecientes,
   * "cortar al primero que no entra" deja de ser equivalente a "saltear y seguir probando
   * ítems más baratos más adelante" (ver el test de corte determinista).
   */
  perSessionCharTiers: number[];
}

export const HANDOFF_SESSION_CHAR_TIERS = [4000, 3000, 2000, 1500, 1000, 700, 500, 400];

export const DEFAULT_HANDOFF_SESSION_BUDGET: HandoffSessionBudgetConfig = {
  beforeBudgetChars: 16_000,
  afterBudgetChars: 16_000,
  perSessionCharTiers: HANDOFF_SESSION_CHAR_TIERS,
};

function fillBlock(
  items: HandoffSessionCandidate[],
  block: HandoffSessionBlock,
  budgetChars: number,
  tiers: number[],
): HandoffSessionPlanItem[] {
  const sorted = [...items].sort((a, b) => b.date - a.date);
  const out: HandoffSessionPlanItem[] = [];
  let used = 0;
  for (let i = 0; i < sorted.length; i++) {
    const maxChars = tiers[Math.min(i, tiers.length - 1)];
    if (used + maxChars > budgetChars) break; // corte determinista — ver el comentario de perSessionCharTiers
    out.push({ id: sorted[i].id, block, rank: i, maxChars });
    used += maxChars;
  }
  return out;
}

/**
 * `candidates` YA pasaron la regla de relevancia (título/participantes) — acá solo se ordena
 * y se recorta por presupuesto. Sin `closeDateMs`, un solo bloque `"sin_ancla"` por recencia
 * con el presupuesto combinado (fallback limpio: mismo comportamiento de hoy, ventana más
 * ancha). Con `closeDateMs`, split en dos: `antes_cierre` = `date < closeDateMs` (más cercana
 * al cierre primero); `despues_cierre` = `date >= closeDateMs` (más reciente primero — el día
 * del cierre mismo cuenta como "ya cerrado", no como "antes").
 *
 * ⚠ LAS REUNIONES QUE NO OCURRIERON SE DESCARTAN ANTES DE REPARTIR (2026-08-18). Los dos
 * bloques ordenan por fecha, así que una reunión AGENDADA quedaba primera en
 * `despues_cierre` y se llevaba el tier más caro (4.000 caracteres) para traer NADA:
 * todavía no tiene transcripción ni resumen. No es solo desperdicio de presupuesto —
 * desplaza a una reunión real que sí lo tenía. Ver `lib/sessions/ocurridas.ts`.
 *
 * `ahoraMs` es un PARÁMETRO y no un `Date.now()` adentro a propósito: este archivo promete
 * pureza (arriba), y un reloj implícito la rompería. Que sea obligatorio hace que sacar la
 * regla sea un error de tsc, no una omisión muda.
 */
export function planHandoffSessionBudget(
  candidatesCrudos: HandoffSessionCandidate[],
  closeDateMs: number | null,
  ahoraMs: number,
  cfg: HandoffSessionBudgetConfig = DEFAULT_HANDOFF_SESSION_BUDGET,
): HandoffSessionPlanItem[] {
  const candidates = soloOcurridas(candidatesCrudos, ahoraMs);
  if (closeDateMs === null) {
    return fillBlock(candidates, "sin_ancla", cfg.beforeBudgetChars + cfg.afterBudgetChars, cfg.perSessionCharTiers);
  }
  const before = candidates.filter((c) => c.date < closeDateMs);
  const after = candidates.filter((c) => c.date >= closeDateMs);
  return [
    ...fillBlock(before, "antes_cierre", cfg.beforeBudgetChars, cfg.perSessionCharTiers),
    ...fillBlock(after, "despues_cierre", cfg.afterBudgetChars, cfg.perSessionCharTiers),
  ];
}
