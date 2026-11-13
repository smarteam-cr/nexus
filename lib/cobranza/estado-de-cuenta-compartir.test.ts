/**
 * lib/cobranza/estado-de-cuenta-compartir.test.ts — el enlace del estado de cuenta (pedido 17, revisión del 2026-11-13).
 *
 * Lo que no puede romperse: crear sobre un enlace revocado o vencido da una dirección NUEVA (la vieja pudo circular a
 * quien ya no debía verla), crear sobre uno que abre devuelve el mismo, y extender no revive uno revocado. Corre contra
 * una tabla de mentira que entiende los `where` que usa el módulo: si alguien cambia el filtro del reemplazo o el de
 * extender, esto se pone rojo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = {
  cuentaId: string;
  accessToken: string;
  enabledAt: Date;
  venceEn: Date;
  revokedAt: Date | null;
  revocadoPor: string | null;
  lastUsedAt: Date | null;
  vistas: number;
  creadoPor: string | null;
};

const h = vi.hoisted(() => {
  const filas = new Map<string, Fila>();
  type Donde = {
    cuentaId: string;
    revokedAt?: null | { not: null };
    OR?: Array<{ revokedAt?: { not: null }; venceEn?: { lte: Date } }>;
  };
  const cumple = (f: Fila, w: Donde): boolean => {
    if (f.cuentaId !== w.cuentaId) return false;
    if (w.revokedAt === null && f.revokedAt !== null) return false;
    if (w.OR) {
      return w.OR.some((o) => (o.revokedAt ? f.revokedAt !== null : false) || (o.venceEn ? f.venceEn <= o.venceEn.lte : false));
    }
    return true;
  };
  const prisma = {
    cuentaFinanciera: { findUnique: vi.fn(async () => ({ id: "cuenta-1" })) },
    accesoAlEstadoDeCuenta: {
      findUnique: vi.fn(async (a: { where: { cuentaId: string } }) => filas.get(a.where.cuentaId) ?? null),
      createMany: vi.fn(async (a: { data: Array<Partial<Fila> & { cuentaId: string; accessToken: string; venceEn: Date }> }) => {
        let count = 0;
        for (const d of a.data) {
          if (filas.has(d.cuentaId)) continue; // skipDuplicates: el índice único por cuenta
          filas.set(d.cuentaId, {
            cuentaId: d.cuentaId,
            accessToken: d.accessToken,
            enabledAt: new Date(),
            venceEn: d.venceEn,
            revokedAt: null,
            revocadoPor: null,
            lastUsedAt: null,
            vistas: 0,
            creadoPor: d.creadoPor ?? null,
          });
          count++;
        }
        return { count };
      }),
      updateMany: vi.fn(async (a: { where: Donde; data: Partial<Fila> }) => {
        let count = 0;
        for (const f of filas.values()) {
          if (!cumple(f, a.where)) continue;
          Object.assign(f, a.data);
          count++;
        }
        return { count };
      }),
    },
  };
  return { filas, prisma };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: h.prisma }));

import { crearEnlace, extenderEnlace, revocarEnlace, ErrorDelEnlace } from "./estado-de-cuenta-compartir";

const token = (enlace: string | null) => enlace?.split("/").pop() ?? null;

beforeEach(() => {
  h.filas.clear();
});

describe("crear", () => {
  it("sobre uno que abre, devuelve el MISMO enlace", async () => {
    const a = await crearEnlace("cuenta-1", "mzamora@smarteamcr.com");
    const b = await crearEnlace("cuenta-1", "otra@smarteamcr.com");
    expect(a.estado).toBe("activo");
    expect(token(b.enlace)).toBe(token(a.enlace));
  });

  it("sobre uno REVOCADO da una dirección nueva, que abre", async () => {
    const a = await crearEnlace("cuenta-1", null);
    await revocarEnlace("cuenta-1", "mzamora@smarteamcr.com");
    const b = await crearEnlace("cuenta-1", null);
    expect(b.estado).toBe("activo");
    expect(token(b.enlace)).not.toBe(token(a.enlace));
    expect(h.filas.get("cuenta-1")!.revokedAt).toBeNull();
  });

  it("sobre uno VENCIDO da una dirección nueva, con las vistas en cero", async () => {
    const a = await crearEnlace("cuenta-1", null);
    const f = h.filas.get("cuenta-1")!;
    f.venceEn = new Date(Date.now() - 1000);
    f.vistas = 7;
    const b = await crearEnlace("cuenta-1", null);
    expect(b.estado).toBe("activo");
    expect(token(b.enlace)).not.toBe(token(a.enlace));
    expect(b.vistas).toBe(0);
  });
});

describe("extender", () => {
  it("corre el vencimiento con la MISMA dirección", async () => {
    const a = await crearEnlace("cuenta-1", null);
    h.filas.get("cuenta-1")!.venceEn = new Date(Date.now() - 1000);
    const b = await extenderEnlace("cuenta-1");
    expect(b.estado).toBe("activo");
    expect(token(b.enlace)).toBe(token(a.enlace));
  });

  it("NO revive uno revocado: responde 409 y sigue revocado", async () => {
    await crearEnlace("cuenta-1", null);
    await revocarEnlace("cuenta-1", null);
    await expect(extenderEnlace("cuenta-1")).rejects.toMatchObject({ status: 409 });
    await expect(extenderEnlace("cuenta-1")).rejects.toBeInstanceOf(ErrorDelEnlace);
    expect(h.filas.get("cuenta-1")!.revokedAt).not.toBeNull();
  });

  it("sin enlace, no hay nada que extender", async () => {
    await expect(extenderEnlace("cuenta-1")).rejects.toMatchObject({ status: 409 });
  });
});
