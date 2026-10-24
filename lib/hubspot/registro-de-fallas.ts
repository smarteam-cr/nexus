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
 * - `pedidos`: cuántos llegaron a HubSpot. Con eso un día sin ninguna falla también deja su fila (si no, la racha de
 *   «días en 0» no se podría contar: no se distingue un día perfecto de uno sin el registro andando).
 * - `renovaciones`, `esperaMs` (lo esperado por 429) y `cupoMinimo` (el menor `X-HubSpot-RateLimit-Remaining` del día,
 *   solo si bajó de 10).
 *
 * ── DÓNDE ────────────────────────────────────────────────────────────────────
 * En la fila `hubspot-transporte` de `CronJobState` (su `lastResult`), sin SQL nuevo: esa tabla ya guarda filas que no
 * son jobs (candados, `cs-partner-sync-status`) y quien lista los jobs filtra por `allJobs()`. Se guardan los últimos
 * 60 días, por día de Costa Rica. Lo lee `scripts/fallas-de-hubspot.ts`.
 *
 * ⚠ Se acumula en memoria y se guarda a los 10 s del primer evento: un 429 no puede convertirse en una escritura a la
 * base por pedido. Si el proceso muere en esos 10 s, lo de esos segundos se pierde (queda el `console.error`).
 * ⚠ Solo cuenta la app (dentro de Next): los scripts no escriben acá.
 * ⛔ Nunca lanza: contar no puede romper un pedido.
 */
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import type { EventosDelTransporte } from "./transporte";

export const FILA_DEL_REGISTRO = "hubspot-transporte";
const DIAS_QUE_SE_GUARDAN = 60;
const GUARDAR_A_LOS_MS = 10_000;

export interface ConteoDelDia {
  /** Los pedidos que llegaron a HubSpot ese día: el denominador, y lo que hace que un día sin fallas deje su fila. */
  pedidos: number;
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
  return { pedidos: 0, vistos401: 0, renovaciones: 0, fallas401: 0, vistos429: 0, esperaMs: 0, fallas429: 0, cupoMinimo: null };
}

/** Suma `b` a `a` (el cupo, el mínimo). */
export function sumarConteos(a: ConteoDelDia, b: ConteoDelDia): ConteoDelDia {
  const minimos = [a.cupoMinimo, b.cupoMinimo].filter((v): v is number => v !== null);
  return {
    pedidos: a.pedidos + b.pedidos,
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

/** Un día con datos: el registro anduvo (hubo pedidos a HubSpot y se guardaron). */
export function diaConDatos(c: ConteoDelDia | undefined): c is ConteoDelDia {
  return !!c && (c.pedidos ?? 0) > 0;
}

/**
 * Cuántos días seguidos, contando hacia atrás desde `hoy` (`YYYY-MM-DD`, Costa Rica), tienen datos y ninguna falla que
 * llegara al llamador. Es el criterio de éxito de U6: 7. Puro.
 *
 * ⛔ Un día sin datos (sin fila, o sin pedidos) CORTA la racha: en producción hay jobs que le piden a HubSpot cada 15
 * minutos, así que un día sin nada anotado es un día en que el registro no anduvo, no uno perfecto. Hoy, si todavía no
 * tiene datos (es temprano o no se guardó aún), no corta: se empieza a contar desde ayer.
 */
export function diasSeguidosEnCero(dias: Record<string, ConteoDelDia>, hoy: string): number {
  const DIA_MS = 24 * 60 * 60 * 1000;
  let t = Date.parse(`${hoy}T12:00:00Z`);
  if (!diaConDatos(dias[hoy])) t -= DIA_MS;
  let n = 0;
  for (; ; t -= DIA_MS) {
    const c = dias[new Date(t).toISOString().slice(0, 10)];
    if (!diaConDatos(c) || c.fallas401 + c.fallas429 > 0) return n;
    n++;
  }
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
    // Con la fila bloqueada: producción y el 3004 de cada PC escriben en la misma, y leer-sumar-escribir sin el
    // candado deja que el segundo pise lo que anotó el primero.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "CronJobState" ("id", "updatedAt") VALUES (${FILA_DEL_REGISTRO}, now()) ON CONFLICT ("id") DO NOTHING`;
      const filas = await tx.$queryRaw<{ lastResult: unknown }[]>`SELECT "lastResult" FROM "CronJobState" WHERE "id" = ${FILA_DEL_REGISTRO} FOR UPDATE`;
      const nuevo = mezclarRegistro(filas[0]?.lastResult ?? null, lote, new Date());
      await tx.cronJobState.update({ where: { id: FILA_DEL_REGISTRO }, data: { lastResult: nuevo as object } });
    });
  } catch (e) {
    console.error(`[hubspot/registro-de-fallas] no se pudo guardar: ${e instanceof Error ? e.message : String(e)}`);
    // Lo que no se guardó vuelve a lo pendiente: lo lleva el próximo guardado.
    for (const [dia, c] of Object.entries(lote)) pendiente[dia] = sumarConteos(pendiente[dia] ?? conteoVacio(), c);
  }
}

function programar(): void {
  if (programado) return;
  programado = setTimeout(() => void guardar(), GUARDAR_A_LOS_MS);
  // Que un script no quede vivo esperando a guardar el conteo.
  programado.unref?.();
}

function anotar(f: (c: ConteoDelDia) => void): void {
  // Solo cuenta la app: un script (fuera de Next) no escribe en producción sin `ALLOW_PROD_WRITE` por contar un 429.
  // Su 429 igual queda en el `console.error` del transporte.
  if (!process.env.NEXT_RUNTIME) return;
  try {
    f(delDia());
    programar();
  } catch {
    /* contar nunca rompe un pedido */
  }
}

/** Los eventos que el transporte de client.ts le pasa a `pedirAHubspot`. */
export const eventosQueSeCuentan: EventosDelTransporte = {
  pedido: () => anotar((c) => c.pedidos++),
  visto401: () => anotar((c) => c.vistos401++),
  renovado: () => anotar((c) => c.renovaciones++),
  falla401: () => anotar((c) => c.fallas401++),
  visto429: (ms) =>
    anotar((c) => {
      c.vistos429++;
      c.esperaMs += ms;
    }),
  falla429: () => anotar((c) => c.fallas429++),
  // El cupo solo se anota si es bajo.
  cupo: (restante) => {
    if (restante > 10) return;
    anotar((c) => {
      c.cupoMinimo = c.cupoMinimo === null ? restante : Math.min(c.cupoMinimo, restante);
    });
  },
};

/** Guarda ya lo pendiente, sin esperar los 10 s: para la prueba de integración (registro-de-fallas.int.test.ts). */
export function _guardarAhoraParaPruebas(): Promise<void> {
  if (programado) clearTimeout(programado);
  return guardar();
}

/** Lo pendiente de guardar, para las pruebas. */
export function _pendienteParaPruebas(): Record<string, ConteoDelDia> {
  return pendiente;
}
