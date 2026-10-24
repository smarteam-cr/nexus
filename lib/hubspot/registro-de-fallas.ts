/**
 * lib/hubspot/registro-de-fallas.ts — CUÁNTAS VECES HUBSPOT RESPONDIÓ 401 O 429, POR DÍA (U6, 2026-10-24).
 *
 * El criterio de éxito de U6 (docs/integracion-hubspot-plan.md) es contar una semana de fallas por 401 y 429 antes y
 * siete días con 0 después. Hasta el 2026-10-24 no se registraban en ningún lado: un `console.error` en el log del VPS
 * y nada más (en producción no había rastro ni en `CronJobState` ni en `AgentRun`). Este módulo las cuenta.
 *
 * ── QUÉ SE CUENTA ────────────────────────────────────────────────────────────
 * - `vistos401` / `vistos429`: lo que respondió HubSpot. Es el número de ANTES: sin el transporte, cada 429 llegaba
 *   al llamador, y cada 401 también salvo en los 14 lugares que tenían su propio reintento.
 * - `fallas401` / `fallas429`: lo que llegó al llamador aun con el transporte (el criterio de «7 días con 0»).
 * - `renovaciones`, `esperaMs` (lo esperado por 429) y `cupoMinimo` (el menor `X-HubSpot-RateLimit-Remaining` del día,
 *   solo si bajó de 10: un pedido con cupo de sobra no programa una escritura).
 *
 * ── DÓNDE ────────────────────────────────────────────────────────────────────
 * En la fila `hubspot-transporte` de `CronJobState` (su `lastResult`), sin SQL nuevo: esa tabla ya guarda filas que no
 * son jobs (candados, `cs-partner-sync-status`) y quien lista los jobs filtra por `allJobs()`. Se guardan los últimos
 * 60 días, por día de Costa Rica. Lo lee `scripts/fallas-de-hubspot.ts`.
 *
 * ⚠ Se acumula en memoria y se guarda a los 10 s del primer evento: un 429 no puede convertirse en una escritura a la
 * base por pedido. Si el proceso muere en esos 10 s, lo de esos segundos se pierde (queda el `console.error`).
 * ⛔ Nunca lanza: contar no puede romper un pedido.
 */
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import type { EventosDelTransporte } from "./transporte";

export const FILA_DEL_REGISTRO = "hubspot-transporte";
const DIAS_QUE_SE_GUARDAN = 60;
const GUARDAR_A_LOS_MS = 10_000;

export interface ConteoDelDia {
  vistos401: number;
  renovaciones: number;
  fallas401: number;
  vistos429: number;
  esperaMs: number;
  fallas429: number;
  /** El menor cupo restante visto en el día, si bajó de 10; null si no bajó. */
  cupoMinimo: number | null;
}

export interface RegistroGuardado {
  version: 1;
  dias: Record<string, ConteoDelDia>;
  at: string;
}

export function conteoVacio(): ConteoDelDia {
  return { vistos401: 0, renovaciones: 0, fallas401: 0, vistos429: 0, esperaMs: 0, fallas429: 0, cupoMinimo: null };
}

/** Suma `b` a `a` (el cupo, el mínimo). */
export function sumarConteos(a: ConteoDelDia, b: ConteoDelDia): ConteoDelDia {
  const minimos = [a.cupoMinimo, b.cupoMinimo].filter((v): v is number => v !== null);
  return {
    vistos401: a.vistos401 + b.vistos401,
    renovaciones: a.renovaciones + b.renovaciones,
    fallas401: a.fallas401 + b.fallas401,
    vistos429: a.vistos429 + b.vistos429,
    esperaMs: a.esperaMs + b.esperaMs,
    fallas429: a.fallas429 + b.fallas429,
    cupoMinimo: minimos.length ? Math.min(...minimos) : null,
  };
}

/** Lo guardado más lo pendiente, recortado a los últimos `DIAS_QUE_SE_GUARDAN` días. Puro. */
export function mezclarRegistro(guardado: unknown, pendiente: Record<string, ConteoDelDia>, ahora: Date): RegistroGuardado {
  const previo =
    guardado && typeof guardado === "object" && (guardado as RegistroGuardado).version === 1 && typeof (guardado as RegistroGuardado).dias === "object"
      ? (guardado as RegistroGuardado).dias
      : {};
  const dias: Record<string, ConteoDelDia> = {};
  for (const [dia, c] of Object.entries(previo)) dias[dia] = sumarConteos(conteoVacio(), { ...conteoVacio(), ...c });
  for (const [dia, c] of Object.entries(pendiente)) dias[dia] = sumarConteos(dias[dia] ?? conteoVacio(), c);
  const recientes = Object.keys(dias).sort().slice(-DIAS_QUE_SE_GUARDAN);
  return { version: 1, dias: Object.fromEntries(recientes.map((d) => [d, dias[d]])), at: ahora.toISOString() };
}

let pendiente: Record<string, ConteoDelDia> = {};
let programado: ReturnType<typeof setTimeout> | null = null;

function delDia(): ConteoDelDia {
  const dia = crDateParts(new Date()).dateKey;
  return (pendiente[dia] ??= conteoVacio());
}

async function guardar(): Promise<void> {
  programado = null;
  const lote = pendiente;
  pendiente = {};
  if (!Object.keys(lote).length) return;
  try {
    await prisma.$transaction(async (tx) => {
      const fila = await tx.cronJobState.findUnique({ where: { id: FILA_DEL_REGISTRO }, select: { lastResult: true } });
      const nuevo = mezclarRegistro(fila?.lastResult ?? null, lote, new Date());
      await tx.cronJobState.upsert({
        where: { id: FILA_DEL_REGISTRO },
        create: { id: FILA_DEL_REGISTRO, lastResult: nuevo as object },
        update: { lastResult: nuevo as object },
      });
    });
  } catch (e) {
    console.error(`[hubspot/registro-de-fallas] no se pudo guardar: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function programar(): void {
  if (programado) return;
  programado = setTimeout(() => void guardar(), GUARDAR_A_LOS_MS);
  // Que un script no quede vivo esperando a guardar el conteo.
  programado.unref?.();
}

function anotar(f: (c: ConteoDelDia) => void): void {
  try {
    f(delDia());
    programar();
  } catch {
    /* contar nunca rompe un pedido */
  }
}

/** Los eventos que el transporte de client.ts le pasa a `pedirAHubspot`. */
export const eventosQueSeCuentan: EventosDelTransporte = {
  visto401: () => anotar((c) => c.vistos401++),
  renovado: () => anotar((c) => c.renovaciones++),
  falla401: () => anotar((c) => c.fallas401++),
  visto429: (ms) =>
    anotar((c) => {
      c.vistos429++;
      c.esperaMs += ms;
    }),
  falla429: () => anotar((c) => c.fallas429++),
  // El cupo solo se anota si es bajo: un pedido normal no programa una escritura.
  cupo: (restante) => {
    if (restante > 10) return;
    anotar((c) => {
      c.cupoMinimo = c.cupoMinimo === null ? restante : Math.min(c.cupoMinimo, restante);
    });
  },
};

/** Lo pendiente de guardar, para las pruebas. */
export function _pendienteParaPruebas(): Record<string, ConteoDelDia> {
  return pendiente;
}
