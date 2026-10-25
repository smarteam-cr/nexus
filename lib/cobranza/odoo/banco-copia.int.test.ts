/**
 * lib/cobranza/odoo/banco-copia.int.test.ts — la copia de las líneas del banco de Odoo sin conciliar (U15), contra una
 * base REAL y un Odoo falso: las nuevas entran, las que Odoo concilia se cierran (sin borrarse), un fallo del banco no
 * lanza y deja su rastro, la pantalla las recibe, e INV60 avisa si la copia del banco se queda atrás.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import type { OdooTransport } from "./transporte";
import { CLAVE_COPIA_DEL_BANCO, copiarBancoSinConciliar } from "./banco-copia";
import { cargarEstadoDelCruce } from "./servicio";
import { sincronizarOdoo } from "./sync";
import { INV60 } from "@/lib/invariantes/banco-odoo";

const linea = (id: number, amount: number, extra: Record<string, unknown> = {}) => ({
  id,
  date: "2026-10-21",
  payment_ref: `REF ${id}`,
  partner_id: false,
  partner_name: false,
  amount,
  amount_currency: 0,
  foreign_currency_id: false,
  currency_id: [1, "USD"],
  journal_id: [8, "BAC Dolares (USD)"],
  statement_id: [86, "BAC 05-10-2026 - 21-10-2026"],
  move_id: [2000 + id, `2026/00${id}`],
  is_reconciled: false,
  state: "posted",
  ...extra,
});

/** Un Odoo falso: `sinConciliar` es lo que devuelve la lectura de las sin conciliar; `porId`, la relectura por id. */
function odooFalso(sinConciliar: Record<string, unknown>[], porId: Record<string, unknown>[] = []): OdooTransport & { pedidos: unknown[][] } {
  const pedidos: unknown[][] = [];
  return {
    pedidos,
    async buscarYLeer(modelo, dominio) {
      pedidos.push([modelo, dominio]);
      const d = dominio as unknown[][];
      return d[0]?.[0] === "id" ? porId : sinConciliar;
    },
    async contar() {
      return 0;
    },
    async agrupar() {
      return [];
    },
  };
}

const AHORA = new Date("2026-10-26T15:00:00Z");

describe("la copia del banco de Odoo", () => {
  it("copia las sin conciliar, con su signo, y no duplica al volver a copiar", async () => {
    const t = odooFalso([linea(877, 3380), linea(882, -22000, { currency_id: [39, "CRC"], journal_id: [6, "BAC Colones"] })]);
    const r = await copiarBancoSinConciliar(t, AHORA);
    expect(r).toMatchObject({ ok: true, sinConciliar: 2, nuevas: 2, conciliadas: 0, desaparecidas: 0, error: null });
    const filas = await prisma.movimientoBancoOdoo.findMany({ orderBy: { odooLineId: "asc" } });
    expect(filas.map((f) => [f.odooLineId, Number(f.monto), f.moneda, f.diario, f.estadoEspejo])).toEqual([
      [877, 3380, "USD", "BAC Dolares (USD)", "SIN_CONCILIAR"],
      [882, -22000, "CRC", "BAC Colones", "SIN_CONCILIAR"],
    ]);
    expect(filas[0]!.fecha.toISOString().slice(0, 10)).toBe("2026-10-21");
    const otra = await copiarBancoSinConciliar(t, new Date("2026-10-26T16:00:00Z"));
    expect(otra.nuevas).toBe(0);
    expect(await prisma.movimientoBancoOdoo.count()).toBe(2);
  });

  it("la que Odoo concilia queda CONCILIADA, la que ya no existe DESAPARECIDA; ninguna se borra, y una desconciliada vuelve", async () => {
    await copiarBancoSinConciliar(odooFalso([linea(1, 100), linea(2, -50), linea(3, 70)]), AHORA);
    const t = odooFalso([linea(3, 70)], [{ id: 1, is_reconciled: true }]);
    const r = await copiarBancoSinConciliar(t, new Date("2026-10-26T16:00:00Z"));
    expect(r).toMatchObject({ ok: true, conciliadas: 1, desaparecidas: 1 });
    // La relectura pidió exactamente las dos que se fueron.
    expect(t.pedidos.find((p) => (p[1] as unknown[][])[0]?.[0] === "id")?.[1]).toEqual([["id", "in", [1, 2]]]);
    const estados = Object.fromEntries((await prisma.movimientoBancoOdoo.findMany()).map((m) => [m.odooLineId, [m.estadoEspejo, m.cerradaEn !== null]]));
    expect(estados).toEqual({ 1: ["CONCILIADA", true], 2: ["DESAPARECIDA", true], 3: ["SIN_CONCILIAR", false] });
    // Alguien la desconcilia en Odoo: vuelve a la lista.
    await copiarBancoSinConciliar(odooFalso([linea(1, 100), linea(3, 70)]), new Date("2026-10-26T17:00:00Z"));
    const una = await prisma.movimientoBancoOdoo.findUniqueOrThrow({ where: { odooLineId: 1 } });
    expect([una.estadoEspejo, una.cerradaEn]).toEqual(["SIN_CONCILIAR", null]);
  });

  it("si Odoo falla no lanza: guarda el error y conserva la última buena; una línea que no se sabe leer no se da por ida", async () => {
    await copiarBancoSinConciliar(odooFalso([linea(1, 100)]), AHORA);
    const rota: OdooTransport = {
      async buscarYLeer() {
        throw new Error("ECONNRESET");
      },
      async contar() {
        return 0;
      },
      async agrupar() {
        return [];
      },
    };
    const r = await copiarBancoSinConciliar(rota, new Date("2026-10-26T16:00:00Z"));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ECONNRESET");
    expect(r.ultimaBuena).toBe(AHORA.toISOString());
    const fila = await prisma.cronJobState.findUniqueOrThrow({ where: { id: CLAVE_COPIA_DEL_BANCO } });
    expect(fila.lastResult).toMatchObject({ ok: false, ultimaBuena: AHORA.toISOString() });
    // Sin fecha no se lee, pero Odoo la sigue devolviendo: queda sin conciliar, no desaparecida.
    const r2 = await copiarBancoSinConciliar(odooFalso([linea(1, 100, { date: false })]), new Date("2026-10-26T17:00:00Z"));
    expect(r2.rechazadas).toEqual(["línea 1: sin fecha"]);
    expect((await prisma.movimientoBancoOdoo.findUniqueOrThrow({ where: { odooLineId: 1 } })).estadoEspejo).toBe("SIN_CONCILIAR");
  });

  it("una línea en cero no es plata que se movió: no se copia y se cuenta aparte", async () => {
    const r = await copiarBancoSinConciliar(odooFalso([linea(1, 100), linea(2, 0)]), AHORA);
    expect(r).toMatchObject({ ok: true, sinConciliar: 1, enCero: 1 });
    expect(await prisma.movimientoBancoOdoo.count()).toBe(1);
  });

  it("el freno: si de golpe dejan de venir muchas y Odoo no las da conciliadas, no marca ninguna y la corrida no es buena", async () => {
    await copiarBancoSinConciliar(odooFalso(Array.from({ length: 10 }, (_, i) => linea(i + 1, -10 - i))), AHORA);
    // Un permiso que cambió: la lectura viene vacía y la relectura tampoco las ve. Solo la 1 vuelve conciliada.
    const r = await copiarBancoSinConciliar(odooFalso([], [{ id: 1, is_reconciled: true }]), new Date("2026-10-26T16:00:00Z"));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("dejaron de venir de golpe");
    expect(r.ultimaBuena).toBe(AHORA.toISOString());
    const porEstado = await prisma.movimientoBancoOdoo.groupBy({ by: ["estadoEspejo"], _count: { _all: true } });
    expect(Object.fromEntries(porEstado.map((g) => [g.estadoEspejo, g._count._all]))).toEqual({ CONCILIADA: 1, SIN_CONCILIAR: 9 });
  });

  it("lo que no cambió solo se estampa con la hora de la copia; lo que cambió se reescribe", async () => {
    await copiarBancoSinConciliar(odooFalso([linea(1, 100), linea(2, 200)]), AHORA);
    await copiarBancoSinConciliar(odooFalso([linea(1, 100), linea(2, 250)]), new Date("2026-10-26T16:00:00Z"));
    const una = await prisma.movimientoBancoOdoo.findUniqueOrThrow({ where: { odooLineId: 1 } });
    const dos = await prisma.movimientoBancoOdoo.findUniqueOrThrow({ where: { odooLineId: 2 } });
    expect(una.sincronizadoEn.toISOString()).toBe("2026-10-26T16:00:00.000Z");
    expect(Number(dos.monto)).toBe(250);
  });

  it("«Lo que no cuadra» recibe solo las sin conciliar", async () => {
    await copiarBancoSinConciliar(odooFalso([linea(1, 100), linea(2, -50)]), AHORA);
    await copiarBancoSinConciliar(odooFalso([linea(1, 100)], [{ id: 2, is_reconciled: true }]), new Date("2026-10-26T16:00:00Z"));
    const { estado } = await cargarEstadoDelCruce();
    expect(estado.banco?.map((m) => [m.monto, m.moneda, m.referencia])).toEqual([[100, "USD", "REF 1"]]);
  });
});

describe("la copia de Odoo con el banco roto", () => {
  it("⛔ un fallo del banco no tumba la copia de las facturas: la corrida queda buena y la factura guardada", async () => {
    /* La edición que la pone en rojo: hacer que copiarBancoSinConciliar lance, o moverla antes de guardar las facturas.
       La copia de las facturas es la que alimenta el cobro de lo pagado: una corrida fallida retiene el día. */
    const factura = {
      id: 1234, name: "FAC/2026/0087", move_type: "out_invoice", state: "posted", payment_state: "not_paid",
      invoice_date: "2026-07-15", invoice_date_due: "2026-07-30", amount_untaxed: 2000, amount_total: 2260,
      amount_residual: 2260, amount_tax: 260, amount_total_signed: 2260, currency_id: [2, "USD"],
      partner_id: [35, "ACCCSA REVISTA & PUBLICACIONES S.A."], write_date: "2026-07-16 14:22:03",
    };
    const t: OdooTransport = {
      async buscarYLeer(modelo) {
        if (modelo === "account.move") return [factura];
        if (modelo === "res.partner") return [];
        throw new Error("403: sin permiso sobre account.bank.statement.line");
      },
      async contar() {
        return 0;
      },
      async agrupar() {
        return [];
      },
    };
    const r = await sincronizarOdoo({ disparadaPor: "test", transporte: t });
    expect(r.ok).toBe(true);
    expect(r.banco).toMatchObject({ ok: false });
    expect(r.banco?.error).toContain("403");
    expect(await prisma.facturaOdoo.count({ where: { odooMoveId: 1234 } })).toBe(1);
    const corrida = await prisma.syncOdooCorrida.findUniqueOrThrow({ where: { id: r.corridaId } });
    expect(corrida.ok).toBe(true);
  });
});

describe("INV60", () => {
  const corridaOk = (iniciadaEn: Date) => prisma.syncOdooCorrida.create({ data: { disparadaPor: "test", ok: true, iniciadaEn, terminadaEn: iniciadaEn } });

  it("sin corridas del banco cumple; al día cumple; atrás más de 3 horas viola; sin ninguna buena viola", async () => {
    await corridaOk(AHORA);
    expect((await INV60.correr(prisma, AHORA)).ok).toBe(true);

    await copiarBancoSinConciliar(odooFalso([]), new Date(AHORA.getTime() - 60 * 60_000));
    expect((await INV60.correr(prisma, AHORA)).ok).toBe(true);

    await corridaOk(new Date(AHORA.getTime() + 5 * 3_600_000));
    const atras = await INV60.correr(prisma, AHORA);
    expect(atras.ok).toBe(false);
    expect(atras.lineas[0]).toContain("líneas del banco viejas");

    await prisma.cronJobState.update({ where: { id: CLAVE_COPIA_DEL_BANCO }, data: { lastResult: { ok: false, at: AHORA.toISOString(), ultimaBuena: null, error: "x" } } });
    expect((await INV60.correr(prisma, AHORA)).lineas[0]).toContain("nunca terminó bien");
  });
});
