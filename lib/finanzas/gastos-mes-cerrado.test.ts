/**
 * lib/finanzas/gastos-mes-cerrado.test.ts — UN GASTO DE UN MES CERRADO NO SE EDITA NI SE BORRA (2026-10-05).
 *
 * Correr: `npx vitest run --project unit lib/finanzas/gastos-mes-cerrado.test.ts`.
 *
 * Antes solo la pantalla (Gastos del mes) escondía «Editar» y «Borrar» en un mes cerrado: las dos rutas
 * (/api/finanzas/gastos/[gastoId] y su gemela /api/cobranza/gastos/[gastoId]) dejaban cambiar los
 * números de un mes que ya se cerró. Ahora contestan 409 con un mensaje claro y NO tocan la base. Se
 * prueban las rutas reales con la base y los guards simulados. La edición que la pone en rojo: sacar
 * `frenarSiElMesEstaCerrado` de `deleteGasto` o de `updateGasto` (lib/cobranza/mutations.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { db, guards } = vi.hoisted(() => ({
  db: {
    gastoPuntual: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    revisionRegistro: { findUnique: vi.fn(), update: vi.fn() },
    cierreMes: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  guards: {
    guardGastosEditor: vi.fn(),
    guardCostosAccess: vi.fn(),
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guards", () => guards);
vi.mock("@/lib/para-ti/avisos-server", () => ({ avisar: vi.fn() }));
// mutations.ts importa los cargadores de Cobranza; acá no se usan.
vi.mock("@/lib/cobranza/queries", () => ({}));

import * as rutaFinanzas from "@/app/api/finanzas/gastos/[gastoId]/route";
import * as rutaCobranza from "@/app/api/cobranza/gastos/[gastoId]/route";

const CERRADO = "2026-09";
const params = { params: Promise.resolve({ gastoId: "g1" }) };
const pedido = (method: string, body?: unknown) =>
  new Request("http://localhost/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
const gastoDel = (dia: string) => ({
  nombre: "Hosting",
  monto: 120,
  moneda: "USD",
  fecha: new Date(`${dia}T00:00:00Z`),
  registradoPor: "dinia@smarteamcr.com",
  createdAt: new Date(`${dia}T15:00:00Z`),
});

beforeEach(() => {
  for (const tabla of Object.values(db)) {
    if (typeof tabla === "function") tabla.mockReset();
    else for (const fn of Object.values(tabla)) fn.mockReset();
  }
  const ctx = { user: { email: "dinia@smarteamcr.com" }, role: "ADMIN" };
  guards.guardGastosEditor.mockResolvedValue(ctx);
  guards.guardCostosAccess.mockResolvedValue(ctx);
  db.revisionRegistro.findUnique.mockResolvedValue(null);
  db.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  db.gastoPuntual.update.mockResolvedValue({ id: "g1" });
  db.gastoPuntual.delete.mockResolvedValue({ id: "g1" });
  // Septiembre de 2026 está cerrado; cualquier otro mes, abierto.
  db.cierreMes.findFirst.mockImplementation(async (args: { where: { periodo: { in: string[] }; estado: string } }) =>
    args.where.estado === "CERRADO" && args.where.periodo.in.includes(CERRADO) ? { periodo: CERRADO } : null,
  );
});

const RUTAS = [
  ["/api/finanzas/gastos/[gastoId]", rutaFinanzas],
  ["/api/cobranza/gastos/[gastoId]", rutaCobranza],
] as const;

describe("⭐ un gasto de un mes cerrado: 409 y la base intacta", () => {
  for (const [nombre, ruta] of RUTAS) {
    it(`${nombre} DELETE`, async () => {
      db.gastoPuntual.findUnique.mockResolvedValue(gastoDel("2026-09-15"));
      const res = await ruta.DELETE(pedido("DELETE"), params);
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toBe(
        "Septiembre 2026 está cerrado: no se le cambian ni se le borran gastos. Para cambiar algo, quien supervisa Finanzas tiene que reabrir el mes.",
      );
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.gastoPuntual.delete).not.toHaveBeenCalled();
    });

    it(`${nombre} PATCH de un gasto del mes cerrado`, async () => {
      db.gastoPuntual.findUnique.mockResolvedValue(gastoDel("2026-09-15"));
      const res = await ruta.PATCH(pedido("PATCH", { notas: "otra nota" }), params);
      expect(res.status).toBe(409);
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.gastoPuntual.update).not.toHaveBeenCalled();
    });

    it(`${nombre} PATCH que lo mueve a un mes cerrado`, async () => {
      db.gastoPuntual.findUnique.mockResolvedValue(gastoDel("2026-10-02"));
      const res = await ruta.PATCH(pedido("PATCH", { fecha: "2026-09-30" }), params);
      expect(res.status).toBe(409);
      expect(db.gastoPuntual.update).not.toHaveBeenCalled();
    });

    it(`${nombre}: en un mes abierto se edita y se borra como siempre`, async () => {
      db.gastoPuntual.findUnique.mockResolvedValue(gastoDel("2026-10-02"));
      expect((await ruta.PATCH(pedido("PATCH", { notas: "otra nota" }), params)).status).toBe(200);
      expect(db.gastoPuntual.update).toHaveBeenCalledTimes(1);
      expect((await ruta.DELETE(pedido("DELETE"), params)).status).toBe(200);
      expect(db.gastoPuntual.delete).toHaveBeenCalledTimes(1);
    });
  }
});
