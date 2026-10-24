/**
 * lib/hubspot/registro-de-fallas.test.ts — el conteo por día de los 401 y 429 de HubSpot (U6): se acumula en
 * memoria, se guarda UNA vez a los 10 s (nunca una escritura por pedido) y se mezcla con lo guardado sin perder días.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const filas = new Map<string, unknown>();
  /* El SQL a mano se reconoce por su texto: el INSERT crea la fila vacía, el SELECT … FOR UPDATE la lee bloqueada. */
  const sql = (partes: TemplateStringsArray) => partes.join("?");
  const tx = {
    $executeRaw: vi.fn(async (partes: TemplateStringsArray, id: string) => {
      if (sql(partes).includes("ON CONFLICT") && !filas.has(id)) filas.set(id, null);
      return 1;
    }),
    $queryRaw: vi.fn(async (partes: TemplateStringsArray, id: string) => {
      expect(sql(partes)).toContain("FOR UPDATE");
      return filas.has(id) ? [{ lastResult: filas.get(id) }] : [];
    }),
    cronJobState: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { lastResult: unknown } }) => {
        filas.set(where.id, data.lastResult);
      }),
    },
  };
  return { filas, tx, prisma: { $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)) } };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db.prisma }));

import { FILA_DEL_REGISTRO, conteoVacio, diasSeguidosEnCero, eventosQueSeCuentan, mezclarRegistro, type RegistroGuardado } from "./registro-de-fallas";

const runtime = process.env.NEXT_RUNTIME;
beforeEach(() => {
  process.env.NEXT_RUNTIME = "nodejs"; // solo la app guarda
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T18:00:00Z")); // 12:00 en Costa Rica
  db.filas.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  if (runtime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = runtime;
});

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

describe("diasSeguidosEnCero (el criterio de U6)", () => {
  const sin = () => ({ ...conteoVacio(), pedidos: 10 });
  const con = () => ({ ...conteoVacio(), pedidos: 10, fallas429: 1 });

  it("una semana sin una falla da 7, aunque haya días sin fila", () => {
    const dias = { "2026-10-18": sin(), "2026-10-20": sin(), "2026-10-24": sin() };
    expect(diasSeguidosEnCero(dias, "2026-10-24")).toBe(7);
  });

  it("corta en el último día con una falla, y no cuenta antes del primer día registrado", () => {
    expect(diasSeguidosEnCero({ "2026-10-20": con(), "2026-10-22": sin() }, "2026-10-24")).toBe(4);
    expect(diasSeguidosEnCero({ "2026-10-24": con() }, "2026-10-24")).toBe(0);
    expect(diasSeguidosEnCero({ "2026-10-14": con() }, "2026-10-24")).toBe(10);
    expect(diasSeguidosEnCero({}, "2026-10-24")).toBe(0);
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
      pedidos: 0,
      vistos401: 1,
      renovaciones: 1,
      fallas401: 0,
      vistos429: 2,
      esperaMs: 2000,
      fallas429: 1,
      cupoMinimo: 3,
    });
  });

  it("un cupo de sobra no se anota", async () => {
    eventosQueSeCuentan.cupo!(100);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("si la base falla, no lanza, y lo no guardado lo lleva el próximo guardado", async () => {
    db.prisma.$transaction.mockRejectedValueOnce(new Error("sin conexión"));
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    eventosQueSeCuentan.falla401!();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(consola).toHaveBeenCalled();
    consola.mockRestore();
    eventosQueSeCuentan.falla401!();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((db.filas.get(FILA_DEL_REGISTRO) as RegistroGuardado).dias["2026-10-24"].fallas401).toBe(2);
  });

  it("un día sin fallas deja su fila con los pedidos (si no, la racha de días en 0 no se puede contar)", async () => {
    eventosQueSeCuentan.pedido!();
    eventosQueSeCuentan.pedido!();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((db.filas.get(FILA_DEL_REGISTRO) as RegistroGuardado).dias["2026-10-24"]).toMatchObject({ pedidos: 2, fallas401: 0, fallas429: 0 });
  });

  it("dos guardados seguidos suman, no se pisan", async () => {
    eventosQueSeCuentan.visto429!(1000);
    await vi.advanceTimersByTimeAsync(10_000);
    eventosQueSeCuentan.visto429!(500);
    await vi.advanceTimersByTimeAsync(10_000);
    const dia = (db.filas.get(FILA_DEL_REGISTRO) as RegistroGuardado).dias["2026-10-24"];
    expect(dia.vistos429).toBe(2);
    expect(dia.esperaMs).toBe(1500);
  });

  it("fuera de Next (un script) no guarda nada", async () => {
    delete process.env.NEXT_RUNTIME;
    eventosQueSeCuentan.falla429!();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });
});
