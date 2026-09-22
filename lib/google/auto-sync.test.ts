import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  autoSyncGoogleMeet,
  conMarca,
  COOLDOWN_MS,
  esperaTrasFallo,
  ESPERA_BASE_MS,
  ESPERA_TOPE_MS,
  fallosSeguidosDe,
  noCorrerAntesDe,
  VENCE_TURNO_MS,
  type DbDeTurnos,
  type DepsDeAutoSync,
  type EstadoDeAutoSync,
} from "./auto-sync";

/**
 * lib/google/auto-sync.test.ts — el auto-sync de Meet con FRENO.
 *
 * Incidente 2026-09-21 (821 % de CPU, producción sin atender): el cooldown de 20 min se contaba
 * desde el ARRANQUE de corridas que duraban 6–15 min, y al fallar se liberaba el turno y la carga
 * siguiente volvía a correr todo. Estas pruebas fijan el freno: cooldown desde el FIN, espera
 * creciente tras un fallo, una corrida a la vez en el proceso y entre procesos (también contra un
 * proceso con el código VIEJO), y un turno que vence si el proceso muere a mitad. Más C-21
 * (2026-09-04): con el turno bloqueado, una lectura y ningún write.
 */

const MIN = 60 * 1000;
const T0 = new Date("2026-09-21T15:00:00Z").getTime();

type Fila = { lastRunAt: Date | null; lastResult: Prisma.JsonValue | null };

/** La fila como la deja ESTE código: `lastRunAt` = «no correr antes de», con su marca en `lastResult`. */
function filaNuestra(noAntesDe: number, resultado: Prisma.JsonObject = {}): Fila {
  const d = new Date(noAntesDe);
  return { lastRunAt: d, lastResult: { ...resultado, noAntesDe: d.toISOString() } };
}

/** La fila como la deja el código VIEJO (anterior al 2026-09-21) al tomar el turno: su ARRANQUE. */
function filaVieja(arranque: number, lastResult: Prisma.JsonValue | null = null): Fila {
  return { lastRunAt: new Date(arranque), lastResult };
}

/** Una fila de CronJobState en memoria, con la MISMA condición atómica que el UPDATE real. */
function tablaFalsa(inicial: Fila | null) {
  const t = { fila: inicial, llamadas: [] as string[], escrituras: [] as Array<{ lastRunAt: Date; lastResult: Prisma.InputJsonObject }> };
  // Cede el hilo como una ida a la base: así dos corridas en paralelo se intercalan de verdad.
  const red = () => new Promise<void>((r) => setImmediate(r));
  const db: DbDeTurnos = {
    cronJobState: {
      async findUnique() {
        await red();
        t.llamadas.push("findUnique");
        return t.fila ? { ...t.fila } : null;
      },
      async upsert() {
        await red();
        t.llamadas.push("upsert");
        if (!t.fila) t.fila = { lastRunAt: null, lastResult: null };
        return t.fila;
      },
      async updateMany({ where, data }) {
        await red();
        t.llamadas.push("updateMany");
        const fila = t.fila;
        if (!fila) return { count: 0 };
        // Compara-y-cambia, como `WHERE "lastRunAt" = $1` (o `IS NULL`).
        const cumple = (fila.lastRunAt?.getTime() ?? null) === (where.lastRunAt?.getTime() ?? null);
        if (!cumple) return { count: 0 };
        t.escrituras.push(data);
        // Ida y vuelta por JSON, como la columna real.
        t.fila = { lastRunAt: data.lastRunAt, lastResult: JSON.parse(JSON.stringify(data.lastResult)) };
        return { count: 1 };
      },
    },
  };
  return { t, db };
}

/** Un proceso: su memoria, su reloj y lo que tarda (o si falla) cada corrida. */
function proceso(
  db: DbDeTurnos,
  opts: { reloj: { ms: number }; duraMs?: number; falla?: boolean; llamadas?: string[]; puerta?: Promise<void> },
) {
  const estado: EstadoDeAutoSync = { running: false, cooldownHasta: null };
  const deps: DepsDeAutoSync = {
    db,
    sync: async () => {
      opts.llamadas?.push("sync");
      await new Promise<void>((r) => setImmediate(r));
      if (opts.puerta) await opts.puerta;
      opts.reloj.ms += opts.duraMs ?? 0;
      if (opts.falla) throw new Error("Calendar 500");
      return { synced: 1, alreadyExisted: 0 };
    },
    enrich: async () => {
      opts.llamadas?.push("enrich");
      return { enriched: 0, skipped: 0, errors: 0 };
    },
    ahora: () => new Date(opts.reloj.ms),
    configurado: () => true,
    estado,
  };
  return { estado, deps };
}

describe("C-21: con el turno bloqueado no se escribe nada", () => {
  it("LA guarda: UNA lectura y ningún write; el proceso recuerda hasta cuándo", async () => {
    /* La edición que la pone en rojo: volver al upsert + updateMany incondicionales. */
    const { t, db } = tablaFalsa(filaNuestra(T0 + 5 * MIN));
    const { deps, estado } = proceso(db, { reloj: { ms: T0 } });
    expect(await autoSyncGoogleMeet(deps)).toEqual({ skipped: true, reason: "cooldown" });
    expect(t.llamadas).toEqual(["findUnique"]);
    expect(estado.cooldownHasta).toBe(T0 + 5 * MIN);
  });

  it("y la segunda carga dentro del cooldown no toca la base: ni lectura", async () => {
    const { t, db } = tablaFalsa(filaNuestra(T0 + 5 * MIN));
    const { deps } = proceso(db, { reloj: { ms: T0 } });
    await autoSyncGoogleMeet(deps);
    await autoSyncGoogleMeet(deps);
    expect(t.llamadas).toEqual(["findUnique"]);
  });

  it("la fila se crea SOLO la primera vez", async () => {
    const { t, db } = tablaFalsa(null);
    const { deps } = proceso(db, { reloj: { ms: T0 } });
    await autoSyncGoogleMeet(deps);
    expect(t.llamadas).toEqual(["findUnique", "upsert", "updateMany", "updateMany"]);
  });
});

describe("el cooldown cuenta desde el FIN de la corrida", () => {
  it("LA guarda: una corrida de 15 min deja la próxima para fin + 20, no para inicio + 20", async () => {
    /* La edición que la pone en rojo: calcular la próxima desde el inicio (lo que hacía el código
       del incidente: corridas de 15 min con 5 min de respiro). */
    const reloj = { ms: T0 };
    const { t, db } = tablaFalsa(filaNuestra(T0 - 1 * MIN));
    const llamadas: string[] = [];
    const { deps, estado } = proceso(db, { reloj, duraMs: 15 * MIN, llamadas });
    const r = await autoSyncGoogleMeet(deps);
    expect(r.skipped).toBe(false);
    expect(llamadas).toEqual(["sync", "enrich"]);
    const fin = T0 + 15 * MIN;
    expect(t.fila?.lastRunAt?.getTime(), "la base").toBe(fin + COOLDOWN_MS);
    expect(estado.cooldownHasta, "la memoria del proceso").toBe(fin + COOLDOWN_MS);
    expect(noCorrerAntesDe(t.fila), "el cierre deja su marca: la próxima lectura lo toma tal cual").toBe(fin + COOLDOWN_MS);

    // 25 min después del inicio (10 después del fin): con el cálculo viejo ya correría otra.
    const otro = proceso(db, { reloj: { ms: T0 + 25 * MIN }, llamadas });
    expect(await autoSyncGoogleMeet(otro.deps)).toEqual({ skipped: true, reason: "cooldown" });
    expect(llamadas).toEqual(["sync", "enrich"]);
  });

  it("mientras corre, el turno queda tomado hasta su vencimiento", async () => {
    const reloj = { ms: T0 };
    const { t, db } = tablaFalsa({ lastRunAt: null, lastResult: null });
    const { deps } = proceso(db, { reloj });
    await autoSyncGoogleMeet(deps);
    const vence = new Date(T0 + VENCE_TURNO_MS);
    expect(t.escrituras[0], "el claim, con su marca").toEqual({ lastRunAt: vence, lastResult: { noAntesDe: vence.toISOString() } });
    expect(t.escrituras[1]?.lastResult).toMatchObject({ ok: true, fallosSeguidos: 0, sync: { nuevas: 1, existentes: 0 } });
  });
});

describe("si falla, espera antes de reintentar", () => {
  it("LA guarda: el fallo NO libera el turno — la próxima carga no vuelve a correr", async () => {
    /* La edición que la pone en rojo: liberar el turno en el catch (`lastRunAt: null` y
       `cooldownHasta = null`), que es lo que hacía el código del incidente. */
    const reloj = { ms: T0 };
    const { t, db } = tablaFalsa({ lastRunAt: null, lastResult: null });
    const llamadas: string[] = [];
    const { deps, estado } = proceso(db, { reloj, duraMs: 2 * MIN, falla: true, llamadas });
    expect(await autoSyncGoogleMeet(deps)).toEqual({ skipped: true, reason: "error" });
    const fin = T0 + 2 * MIN;
    expect(t.fila?.lastRunAt?.getTime()).toBe(fin + ESPERA_BASE_MS);
    expect(t.fila?.lastResult).toMatchObject({ ok: false, fallosSeguidos: 1, error: "Calendar 500" });
    expect(estado.cooldownHasta).toBe(fin + ESPERA_BASE_MS);
    expect(estado.running).toBe(false);

    reloj.ms = fin + 1000;
    expect(await autoSyncGoogleMeet(deps)).toEqual({ skipped: true, reason: "cooldown" });
    expect(llamadas, "no reintentó al segundo").toEqual(["sync"]);
  });

  it("la espera crece con los fallos seguidos (lo lee de la fila) y un éxito la resetea", async () => {
    const reloj = { ms: T0 };
    const { t, db } = tablaFalsa(filaNuestra(T0 - MIN, { ok: false, fallosSeguidos: 2 }));
    const falla = proceso(db, { reloj, falla: true });
    await autoSyncGoogleMeet(falla.deps);
    expect(t.fila?.lastRunAt?.getTime()).toBe(T0 + 4 * ESPERA_BASE_MS);
    expect(t.fila?.lastResult).toMatchObject({ fallosSeguidos: 3 });

    reloj.ms = T0 + 4 * ESPERA_BASE_MS;
    const anda = proceso(db, { reloj });
    expect((await autoSyncGoogleMeet(anda.deps)).skipped).toBe(false);
    expect(t.fila?.lastResult).toMatchObject({ ok: true, fallosSeguidos: 0 });
  });

  it("esperaTrasFallo: 5, 10, 20, 40 y tope de 60 min", () => {
    expect([1, 2, 3, 4, 5, 10].map((n) => esperaTrasFallo(n) / MIN)).toEqual([5, 10, 20, 40, 60, 60]);
    expect(esperaTrasFallo(0)).toBe(ESPERA_BASE_MS);
    expect(ESPERA_TOPE_MS).toBe(60 * MIN);
  });

  it("fallosSeguidosDe: lo ilegible cuenta como 0", () => {
    expect(fallosSeguidosDe(null)).toBe(0);
    expect(fallosSeguidosDe("x")).toBe(0);
    expect(fallosSeguidosDe([1])).toBe(0);
    expect(fallosSeguidosDe({ fallosSeguidos: "3" })).toBe(0);
    expect(fallosSeguidosDe({ fallosSeguidos: -1 })).toBe(0);
    expect(fallosSeguidosDe({ fallosSeguidos: 4 })).toBe(4);
  });

  it("si la base no responde al leer, el proceso igual espera (en memoria)", async () => {
    const { db } = tablaFalsa(null);
    const rota: DbDeTurnos = {
      cronJobState: {
        ...db.cronJobState,
        findUnique: () => Promise.reject(new Error("Connection timeout")),
      },
    };
    const { deps, estado } = proceso(rota, { reloj: { ms: T0 } });
    expect(await autoSyncGoogleMeet(deps)).toEqual({ skipped: true, reason: "error" });
    expect(estado.cooldownHasta).toBe(T0 + ESPERA_BASE_MS);
  });
});

describe("nunca dos corridas a la vez", () => {
  it("en el proceso: la segunda llamada simultánea no corre (mutex)", async () => {
    const reloj = { ms: T0 };
    const { db } = tablaFalsa({ lastRunAt: null, lastResult: null });
    const llamadas: string[] = [];
    const { deps } = proceso(db, { reloj, llamadas });
    const [a, b] = await Promise.all([autoSyncGoogleMeet(deps), autoSyncGoogleMeet(deps)]);
    expect([a.skipped, b.reason]).toEqual([false, "already_running"]);
    expect(llamadas.filter((l) => l === "sync")).toHaveLength(1);
  });

  it("entre procesos: los dos leen la fila libre, solo uno gana el turno", async () => {
    /* La edición que la pone en rojo: tomar el turno con un UPDATE sin condición (o con upsert). */
    const reloj = { ms: T0 };
    const { db } = tablaFalsa({ lastRunAt: null, lastResult: null });
    const llamadas: string[] = [];
    const p1 = proceso(db, { reloj, llamadas });
    const p2 = proceso(db, { reloj, llamadas });
    const r = await Promise.all([autoSyncGoogleMeet(p1.deps), autoSyncGoogleMeet(p2.deps)]);
    expect(r.filter((x) => !x.skipped)).toHaveLength(1);
    expect(llamadas.filter((l) => l === "sync")).toHaveLength(1);
  });

  it("un proceso que murió a mitad: su turno bloquea hasta vencer, y después se libera solo", async () => {
    const { db } = tablaFalsa(filaNuestra(T0 + VENCE_TURNO_MS)); // lo tomó en T0 y murió
    const llamadas: string[] = [];
    const antes = proceso(db, { reloj: { ms: T0 + 30 * MIN }, llamadas });
    expect(await autoSyncGoogleMeet(antes.deps)).toEqual({ skipped: true, reason: "cooldown" });
    const despues = proceso(db, { reloj: { ms: T0 + VENCE_TURNO_MS }, llamadas });
    expect((await autoSyncGoogleMeet(despues.deps)).skipped).toBe(false);
    expect(llamadas).toEqual(["sync", "enrich"]);
  });

  it("el cierre de un turno vencido NO pisa el turno de otro", async () => {
    /* A tomó el turno y tardó más que el vencimiento; B lo tomó y terminó. Cuando A termina, su
       cierre no debe correr la fila de B: la condición es «sigue siendo mío». La edición que la pone
       en rojo: cerrar con `where: { id }` a secas. */
    const { t, db } = tablaFalsa({ lastRunAt: null, lastResult: null });
    let soltarA: () => void = () => {};
    const puertaA = new Promise<void>((r) => (soltarA = r));
    const a = proceso(db, { reloj: { ms: T0 }, puerta: puertaA, duraMs: VENCE_TURNO_MS + 10 * MIN });
    const corridaA = autoSyncGoogleMeet(a.deps);
    while (t.escrituras.length === 0) await new Promise<void>((r) => setImmediate(r)); // A tomó el turno

    const b = proceso(db, { reloj: { ms: T0 + VENCE_TURNO_MS + MIN } });
    expect((await autoSyncGoogleMeet(b.deps)).skipped, "B toma el turno vencido de A").toBe(false);
    const deB = t.fila?.lastRunAt?.getTime();
    expect(deB).toBe(T0 + VENCE_TURNO_MS + MIN + COOLDOWN_MS);

    soltarA();
    expect((await corridaA).skipped).toBe(false);
    expect(t.fila?.lastRunAt?.getTime(), "A no pisó el turno de B").toBe(deB);
  });
});

describe("convive con un proceso del código VIEJO (hasta el deploy, un dev:prod sin pull, un rollback)", () => {
  /* El código anterior al 2026-09-21 guarda en `lastRunAt` el ARRANQUE de su corrida (6–15 min) y
     no escribe `lastResult`. Leído como «no correr antes de», ese arranque ya pasó y este código
     arrancaba otra corrida encima: dos sync y dos enriquecimientos a la vez sobre la base de
     producción. */
  it("LA guarda: con una corrida vieja en curso NO arranca otra — espera los 20 min del viejo", async () => {
    /* La edición que la pone en rojo: leer `lastRunAt` a secas como «no correr antes de». */
    const { t, db } = tablaFalsa(filaVieja(T0)); // el proceso viejo arrancó en T0 y sigue corriendo
    const llamadas: string[] = [];
    const nuevo = proceso(db, { reloj: { ms: T0 + 5 * MIN }, llamadas });
    expect(await autoSyncGoogleMeet(nuevo.deps)).toEqual({ skipped: true, reason: "cooldown" });
    expect(t.llamadas, "una lectura y nada más").toEqual(["findUnique"]);
    expect(nuevo.estado.cooldownHasta).toBe(T0 + COOLDOWN_MS);
    expect(llamadas).toEqual([]);

    // A los 20 min del arranque viejo (lo mismo que esperaría él) ya le toca.
    const despues = proceso(db, { reloj: { ms: T0 + COOLDOWN_MS }, llamadas });
    expect((await autoSyncGoogleMeet(despues.deps)).skipped).toBe(false);
    expect(llamadas).toEqual(["sync", "enrich"]);
  });

  it("una marca nuestra VIEJA no tapa un arranque viejo posterior", async () => {
    /* Nosotros cerramos (marca = T0 - 30 min) y DESPUÉS un proceso viejo tomó el turno en T0: su
       `lastRunAt` ya no coincide con la marca, así que rige la regla del viejo. */
    const cerradaPorNosotros = filaNuestra(T0 - 30 * MIN, { ok: true, fallosSeguidos: 0 });
    const { db } = tablaFalsa({ ...cerradaPorNosotros, lastRunAt: new Date(T0) });
    const nuevo = proceso(db, { reloj: { ms: T0 + 10 * MIN } });
    expect(await autoSyncGoogleMeet(nuevo.deps)).toEqual({ skipped: true, reason: "cooldown" });
    expect(nuevo.estado.cooldownHasta).toBe(T0 + COOLDOWN_MS);
  });

  it("si otro proceso (viejo o nuevo) escribe la fila entre la lectura y el turno, no corre", async () => {
    /* La edición que la pone en rojo: tomar el turno por hora (`lastRunAt <= ahora`) en vez de por
       lo leído: el arranque del viejo, que es «anterior a ahora», no lo frenaba. */
    const { t, db } = tablaFalsa({ lastRunAt: null, lastResult: null });
    const conCarrera: DbDeTurnos = {
      cronJobState: {
        ...db.cronJobState,
        async findUnique(args) {
          const leida = await db.cronJobState.findUnique(args);
          t.fila = filaVieja(T0); // el viejo toma el turno justo después de nuestra lectura
          return leida;
        },
      },
    };
    const llamadas: string[] = [];
    const nuevo = proceso(conCarrera, { reloj: { ms: T0 }, llamadas });
    expect(await autoSyncGoogleMeet(nuevo.deps)).toEqual({ skipped: true, reason: "cooldown" });
    expect(llamadas).toEqual([]);
    expect(t.fila?.lastRunAt?.getTime(), "no le pisó el turno al viejo").toBe(T0);
  });

  it("el código viejo, al fallar, libera el turno (lastRunAt null): este corre", async () => {
    const { db } = tablaFalsa({ lastRunAt: null, lastResult: null });
    const nuevo = proceso(db, { reloj: { ms: T0 } });
    expect((await autoSyncGoogleMeet(nuevo.deps)).skipped).toBe(false);
  });

  it("noCorrerAntesDe y conMarca", () => {
    expect(noCorrerAntesDe(null)).toBeNull();
    expect(noCorrerAntesDe({ lastRunAt: null, lastResult: { noAntesDe: "x" } })).toBeNull();
    expect(noCorrerAntesDe(filaNuestra(T0))).toBe(T0);
    expect(noCorrerAntesDe(filaVieja(T0))).toBe(T0 + COOLDOWN_MS);
    expect(noCorrerAntesDe(filaVieja(T0, "ilegible"))).toBe(T0 + COOLDOWN_MS);
    // La marca conserva lo que ya había (los fallos seguidos, cómo terminó la última).
    expect(conMarca({ ok: false, fallosSeguidos: 2 }, new Date(T0))).toEqual({
      ok: false,
      fallosSeguidos: 2,
      noAntesDe: new Date(T0).toISOString(),
    });
    expect(conMarca(null, new Date(T0))).toEqual({ noAntesDe: new Date(T0).toISOString() });
  });
});
