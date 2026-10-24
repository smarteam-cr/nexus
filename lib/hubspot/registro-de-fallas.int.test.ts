/**
 * lib/hubspot/registro-de-fallas.int.test.ts — el SQL del registro de fallas contra un Postgres de verdad (`nexus_test`).
 *
 * La prueba unitaria usa una base de mentira; esta comprueba lo que esa no puede: que el INSERT crea la fila en una
 * base vacía (como la local del 3005 recién armada), que las columnas existen, y que dos guardados a la vez se SUMAN
 * en vez de pisarse (el `SELECT … FOR UPDATE`). Correr: `npm run db:local -- up` y `npm run test:int`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { FILA_DEL_REGISTRO, _guardarAhoraParaPruebas, eventosQueSeCuentan, type RegistroGuardado } from "./registro-de-fallas";
import { crDateParts } from "@/lib/jobs/time";

const runtime = process.env.NEXT_RUNTIME;
beforeEach(() => {
  process.env.NEXT_RUNTIME = "nodejs"; // solo la app guarda
});
afterEach(() => {
  if (runtime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = runtime;
});

async function leer(): Promise<RegistroGuardado | null> {
  const fila = await prisma.cronJobState.findUnique({ where: { id: FILA_DEL_REGISTRO }, select: { lastResult: true } });
  return (fila?.lastResult as RegistroGuardado | null) ?? null;
}

describe("registro de fallas en una base real", () => {
  it("en una base vacía crea la fila y guarda el conteo del día", async () => {
    eventosQueSeCuentan.pedido!();
    eventosQueSeCuentan.visto429!(2000);
    await _guardarAhoraParaPruebas();
    const r = await leer();
    expect(r?.dias[crDateParts(new Date()).dateKey]).toMatchObject({ pedidos: 1, vistos429: 1, esperaMs: 2000 });
  });

  it("⭐ dos guardados a la vez sobre la fila que ya existe suman (la fila bloqueada), no se pisan", async () => {
    /* La edición que la pone en rojo: sacar el `FOR UPDATE`. Con la fila ya creada, el INSERT … ON CONFLICT DO
       NOTHING no bloquea nada: los dos leen lo mismo y el segundo pisa al primero. */
    eventosQueSeCuentan.pedido!();
    await _guardarAhoraParaPruebas(); // la fila ya existe, como en producción
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      eventosQueSeCuentan.falla401!();
      const primero = _guardarAhoraParaPruebas();
      eventosQueSeCuentan.falla401!();
      eventosQueSeCuentan.falla401!();
      const segundo = _guardarAhoraParaPruebas();
      await Promise.all([primero, segundo]);
    }
    const r = await leer();
    expect(r?.dias[crDateParts(new Date()).dateKey].fallas401).toBe(15);
  });
});
