/**
 * lib/cs/timeline-events.ts
 *
 * Captura de EVENTOS CRUDOS de mutación del cronograma (tabla TimelineEvent) —
 * la cola del watchdog de Éxito del cliente. NO reemplaza a TimelineChange
 * (auditoría D.3 por snapshot con razón obligatoria): esto es granular, barato
 * y sin fricción para el CSE (se emite en silencio desde los endpoints).
 *
 * Contrato:
 *  - `emitTimelineEvents(db, ctx, events)` → un solo createMany. Acepta el
 *    cliente global o un tx de $transaction. Con `events` vacío es no-op.
 *  - Los call sites de mutaciones PESADAS (PUT bulk) lo llaman DESPUÉS de su
 *    transacción, best-effort (try/catch con console.error): perder un evento
 *    es aceptable; alargar una tx que ya sufrió P2028 no.
 *  - `label` viaja denormalizado (título de tarea / nombre de fase) para que el
 *    evento se entienda aunque la entidad se haya borrado después.
 *  - `before`/`after` llevan SOLO los campos que cambiaron (compactos).
 */
import { Prisma, PrismaClient } from "@prisma/client";
import type { CsEventAction, CsEventEntity, CsEventSource } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface TimelineEventCtx {
  projectId: string;
  clientId: string;
  timelineId: string | null;
  actorEmail: string | null;
  source: CsEventSource;
}

export interface DraftEvent {
  entityType: CsEventEntity;
  entityId?: string | null;
  label: string;
  action: CsEventAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/** Inserta el batch de eventos (no-op con lista vacía). NO atrapa errores: el
 *  caller decide si es parte de su tx (inserts triviales) o best-effort post-tx
 *  (usar `emitTimelineEventsSafe`). */
export async function emitTimelineEvents(
  db: Db,
  ctx: TimelineEventCtx,
  events: DraftEvent[],
): Promise<void> {
  if (events.length === 0) return;
  await db.timelineEvent.createMany({
    data: events.map((e) => ({
      projectId: ctx.projectId,
      clientId: ctx.clientId,
      timelineId: ctx.timelineId,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      label: e.label,
      action: e.action,
      before: (e.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (e.after ?? undefined) as Prisma.InputJsonValue | undefined,
      actorEmail: ctx.actorEmail,
      source: ctx.source,
    })),
  });
}

/** Variante best-effort para DESPUÉS de una transacción pesada: nunca lanza —
 *  un fallo al registrar eventos no debe romper la mutación ya commiteada. */
export async function emitTimelineEventsSafe(
  db: Db,
  ctx: TimelineEventCtx,
  events: DraftEvent[],
): Promise<void> {
  try {
    await emitTimelineEvents(db, ctx, events);
  } catch (e) {
    console.error("[cs/timeline-events] no se pudieron registrar eventos:", e);
  }
}

/** Diff plano de campos: devuelve `{ before, after }` con SOLO las keys cuyo
 *  valor difiere (comparación por Object.is sobre primitivos/ISO strings).
 *  null si nada material cambió. `ignore` filtra campos cosméticos. */
export function diffFields(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  ignore: string[] = [],
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    if (ignore.includes(k)) continue;
    const a = prev[k] ?? null;
    const b = next[k] ?? null;
    if (!Object.is(a, b)) {
      before[k] = a;
      after[k] = b;
    }
  }
  return Object.keys(after).length > 0 ? { before, after } : null;
}
