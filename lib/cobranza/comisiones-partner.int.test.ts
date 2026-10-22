/**
 * lib/cobranza/comisiones-partner.int.test.ts — el monto de una comisión de aliado, de punta a punta, contra una base
 * REAL (2026-10-21, feedback #17).
 *
 * Una comisión se anota como estimado y pasa a real cuando llega la factura del aliado (kölbi), con su firma y lo que
 * decía el estimado. Un trimestre en cero (Atom Chat) se registra como «sin comisión»: no se puede cobrar y no vence.
 * Revertir un cobro devuelve la comisión a estimada solo si nadie registró su factura.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import {
  cambiarEstadoComisionPartner,
  CobranzaError,
  createComisionPartner,
  updateComisionPartner,
} from "./mutations";

const QUIEN = "mzamora@test.local";

async function leer(id: string) {
  const c = await prisma.comisionPartner.findUniqueOrThrow({ where: { id } });
  return { ...c, monto: Number(c.monto), montoEstimado: c.montoEstimado === null ? null : Number(c.montoEstimado) };
}

describe("comisiones de aliado: estimado, real de la factura y cero", () => {
  it("EL CASO DE KÖLBI: el estimado pasa a real con la factura, y guarda lo que decía antes", async () => {
    const { id } = await createComisionPartner(
      { partner: "kölbi", monto: 1_000, moneda: "USD", fecha: "2026-09-30" },
      QUIEN,
    );
    expect((await leer(id)).montoEsProyeccion).toBe(true);

    await updateComisionPartner(id, { monto: 1_180.5, montoReal: true, facturaAliado: "F-0042" }, QUIEN);
    const real = await leer(id);
    expect(real.estado).toBe("POR_COBRAR");
    expect(real.montoEsProyeccion).toBe(false);
    expect(real.monto).toBe(1_180.5);
    expect(real.montoEstimado).toBe(1_000);
    expect(real.facturaAliado).toBe("F-0042");
    expect(real.montoRealPor).toBe(QUIEN);
    expect(real.montoRealEn).not.toBeNull();

    // Cobrarla y revertir: la factura sigue registrada, así que el monto sigue siendo el real.
    await cambiarEstadoComisionPartner(id, { estado: "COBRADO", fechaCobro: "2026-10-21" }, QUIEN);
    await cambiarEstadoComisionPartner(id, { estado: "POR_COBRAR" }, QUIEN);
    expect((await leer(id)).montoEsProyeccion).toBe(false);
  });

  it("EL CASO DE ATOM CHAT: un trimestre en cero se registra y no se puede cobrar", async () => {
    const { id } = await createComisionPartner(
      { partner: "Atom Chat", monto: 0, moneda: "USD", fecha: "2026-09-30", montoReal: true, facturaAliado: null },
      QUIEN,
    );
    const cero = await leer(id);
    expect(cero.monto).toBe(0);
    expect(cero.montoEsProyeccion).toBe(false);

    await expect(
      cambiarEstadoComisionPartner(id, { estado: "COBRADO", fechaCobro: "2026-10-21" }, QUIEN),
    ).rejects.toBeInstanceOf(CobranzaError);

    // Y no aparece entre lo que vence (el mismo filtro que usa la lista de inconsistencias).
    const vencidas = await prisma.comisionPartner.count({
      where: { estado: "POR_COBRAR", NOT: { monto: 0, montoEsProyeccion: false } },
    });
    expect(vencidas).toBe(0);
  });

  it("una cobrada no puede nacer en cero ni volver a estimado por el editar", async () => {
    await expect(
      createComisionPartner(
        { partner: "HubSpot", monto: 0, moneda: "USD", fecha: "2026-08-15", estado: "COBRADO", fechaCobro: "2026-08-20" },
        QUIEN,
      ),
    ).rejects.toBeInstanceOf(CobranzaError);

    const { id } = await createComisionPartner(
      { partner: "HubSpot", monto: 45_921.72, moneda: "USD", fecha: "2026-05-15", estado: "COBRADO", fechaCobro: "2026-05-20" },
      QUIEN,
    );
    await expect(updateComisionPartner(id, { montoReal: false }, QUIEN)).rejects.toMatchObject({ status: 409 });
  });

  it("cobrar una estimada con otro monto guarda el estimado; revertirla sin factura la vuelve estimada y lo limpia", async () => {
    const { id } = await createComisionPartner(
      { partner: "HubSpot", monto: 51_000, moneda: "USD", fecha: "2026-08-15" },
      QUIEN,
    );
    await cambiarEstadoComisionPartner(id, { estado: "COBRADO", fechaCobro: "2026-08-20", monto: 50_847 }, QUIEN);
    const cobrada = await leer(id);
    expect(cobrada.montoEsProyeccion).toBe(false);
    expect(cobrada.montoEstimado).toBe(51_000);

    await cambiarEstadoComisionPartner(id, { estado: "POR_COBRAR" }, QUIEN);
    const otraVez = await leer(id);
    expect(otraVez.montoEsProyeccion).toBe(true);
    expect(otraVez.montoEstimado).toBeNull();
  });

  it("⚠ la base frena un monto negativo aunque se salte el Zod", async () => {
    await expect(
      prisma.comisionPartner.create({
        data: { partner: "X", monto: -1, moneda: "USD", fecha: new Date("2026-09-30"), registradoPor: QUIEN },
      }),
    ).rejects.toThrow();
  });
});
