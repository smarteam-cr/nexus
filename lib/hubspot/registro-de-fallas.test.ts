/**
 * lib/hubspot/registro-de-fallas.test.ts — el conteo por día de los 401 y 429 de HubSpot (U6): se acumula en
 * memoria, se guarda UNA vez a los 10 s (nunca una escritura por pedido) y se mezcla con lo guardado sin perder días.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const filas = new Map<string, unknown>();
  const tx = {
    cronJobState: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (filas.has(where.id) ? { lastResult: filas.get(where.id) } : null)),
      upsert: vi.fn(async ({ where, create, update }: { where: { id: string }; create: { lastResult: unknown }; update: { lastResult: unknown } }) => {
        filas.set(where.id, filas.has(where.id) ? update.lastResult : create.lastResult);
      }),
    },
  };
  return { filas, tx, prisma: { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)) } };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db.prisma }));

import { FILA_DEL_REGISTRO, conteoVacio, eventosQueSeCuentan, mezclarRegistro, type RegistroGuardado } from "./registro-de-fallas";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T18:00:00Z")); // 12:00 en Costa Rica
  db.filas.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("mezclarRegistro", () => {
  it("suma al día que ya estaba y guarda el cupo mínimo", () => {
    const guardado: RegistroGuardado = {
      version: 1,
      dias: { "2026-10-24": { ...conteoVacio(), vistos429: 2, esperaMs: 3000, cupoMinimo: 4 } },
      at: "x",
    };
    const r = mezclarRegistro(guardado, { "2026-10-24": { ...conteoVacio(), vistos429: 1, fallas429: 1, esperaMs: 1000, cupoMinimo: 2 } }, new Date());
    expect(r.dias["2026-10-24"]).toEqual({ ...conteoVacio(), vistos429: 3, fallas429: 1, esperaMs: 4000, cupoMinimo: 2 });
  });

  it("guarda solo los últimos 60 días y tolera basura en lo guardado", () => {
    const dias: Record<string, ReturnType<typeof conteoVacio>> = {};
    for (let i = 0; i < 70; i++) dias[`2026-08-${String(i).padStart(2, "0")}`] = { ...conteoVacio(), vistos401: 1 };
    expect(Object.keys(mezclarRegistro({ version: 1, dias, at: "x" }, {}, new Date()).dias)).toHaveLength(60);
    expect(mezclarRegistro({ cualquier: "cosa" }, {}, new Date()).dias).toEqual({});
    expect(mezclarRegistro(null, {}, new Date()).dias).toEqual({});
  });
});

describe("los eventos del transporte", () => {
  it("se acumulan y se guardan UNA vez a los 10 s, en el día de Costa Rica", async () => {
    eventosQueSeCuentan.visto401!();
    eventosQueSeCuentan.renovado!();
    eventosQueSeCuentan.visto429!(2000);
    eventosQueSeCuentan.visto429!(0);
    eventosQueSeCuentan.falla429!();
    eventosQueSeCuentan.cupo!(80); // con cupo de sobra no se anota
    eventosQueSeCuentan.cupo!(3);
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(db.prisma.$transaction).toHaveBeenCalledTimes(1);
    const guardado = db.filas.get(FILA_DEL_REGISTRO) as RegistroGuardado;
    expect(guardado.dias["2026-10-24"]).toEqual({
      vistos401: 1,
      renovaciones: 1,
      fallas401: 0,
      vistos429: 2,
      esperaMs: 2000,
      fallas429: 1,
      cupoMinimo: 3,
    });
  });

  it("un pedido con cupo de sobra no programa ninguna escritura", async () => {
    eventosQueSeCuentan.cupo!(100);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("si la base falla, no lanza", async () => {
    db.prisma.$transaction.mockRejectedValueOnce(new Error("sin conexión"));
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    eventosQueSeCuentan.falla401!();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(consola).toHaveBeenCalled();
    consola.mockRestore();
  });
});
