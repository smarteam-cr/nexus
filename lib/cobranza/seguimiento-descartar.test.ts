/**
 * lib/cobranza/seguimiento-descartar.test.ts — «Descartar» una venta sin cobro NO la saca de lo vendido (2026-11-13).
 *
 * Revisión del 13 de noviembre: Seguimiento descartaba con `VentaGanada.excluida`, la marca de «no es una venta», y la
 * venta dejaba de contar en el vendido del equilibrio, la cuota del vendedor, el bono de las metas y la comisión. Ahora
 * escribe la marca aparte «no genera cobro». Llama a las funciones con Prisma de mentira y mira lo que escriben.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const escrito: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const prisma = {
    ventaGanada: {
      updateMany: vi.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
        escrito.push(args);
        return { count: 1 };
      }),
    },
  };
  return { escrito, prisma };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: h.prisma }));

import { descartarVenta, devolverVentaALaLista } from "./seguimiento-server";
import { clasificarVentas } from "@/lib/ventas/clasificar-huecos";

beforeEach(() => {
  h.escrito.length = 0;
});

describe("descartar desde Seguimiento", () => {
  it("escribe «no genera cobro» con quién, cuándo y por qué, y NUNCA `excluida`", async () => {
    await descartarVenta("v1", "  Es la continuidad del contrato de 2025 ", "MZamora@smarteamcr.com");
    expect(h.escrito).toHaveLength(1);
    const { data } = h.escrito[0]!;
    expect(data).not.toHaveProperty("excluida");
    expect(data).not.toHaveProperty("excluidaMotivo");
    expect(data).toMatchObject({ noGeneraCobroPor: "mzamora@smarteamcr.com", noGeneraCobroMotivo: "Es la continuidad del contrato de 2025" });
    expect(data.noGeneraCobroEn).toBeInstanceOf(Date);
  });

  it("devolver a la lista borra solo esa marca", async () => {
    await devolverVentaALaLista("v1");
    const { data } = h.escrito[0]!;
    expect(data).toEqual({ noGeneraCobroEn: null, noGeneraCobroPor: null, noGeneraCobroMotivo: null });
  });

  it("la venta descartada sigue sumando al vendido (y no es un hueco)", () => {
    const r = clasificarVentas(
      [
        {
          hubspotDealId: "d1",
          nombre: "Continuidad",
          fechaCierre: "2026-10-01",
          monto: 7000,
          pipelineId: "default",
          clientId: "c1",
          excluida: false,
          sospechaPrueba: false,
          noGeneraCobro: true,
        },
      ],
      [],
      { anio: 2026 },
    );
    expect(r.vendido).toBe(7000);
    expect(r.hueco).toBe(0);
  });
});
