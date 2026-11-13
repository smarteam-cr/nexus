/**
 * lib/external/estado-de-cuenta-view.test.ts — ⛔ el estado de cuenta público no deja ver OTRA cuenta ni nada interno
 * (pedido 17, 2026-11-13).
 *
 * Correr: `npx vitest run lib/external/estado-de-cuenta-view.test.ts --project unit`.
 *
 * Dos niveles:
 *   E1 — el chokepoint con un prisma falso: token inválido, revocado y vencido no leen la cuenta; las cuotas se piden
 *        por la cuenta DEL ENLACE y una cuota de otra cuenta que se cuele no llega a la página; los campos internos que
 *        traiga una fila (notas, promesa, quién confirmó) no salen.
 *   E2 — estructurales: la página es dinámica y noindex y no lee la base; la ruta interna pide EDITAR Cobranza en cada
 *        handler; el chokepoint lee con `select` (nunca `include`) y sin columnas internas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/external/smarteam-logo", () => ({ getSmarteamLogoUrl: async () => "/logo-smarteam.png" }));

const db = vi.hoisted(() => ({
  acceso: null as null | { id: string; cuentaId: string; revokedAt: Date | null; venceEn: Date },
  cuentas: {} as Record<string, { id: string; moneda: string; creditoDias: number | null; razonSocial: string | null; client: { name: string } }>,
  cobros: [] as Array<Record<string, unknown>>,
  llamadas: { cuenta: [] as unknown[], cobros: [] as unknown[], update: [] as unknown[] },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    accesoAlEstadoDeCuenta: {
      findUnique: async () => db.acceso,
      update: async (a: unknown) => {
        db.llamadas.update.push(a);
        return {};
      },
    },
    cuentaFinanciera: {
      findUnique: async (a: { where: { id: string } }) => {
        db.llamadas.cuenta.push(a);
        return db.cuentas[a.where.id] ?? null;
      },
    },
    cobro: {
      // ⚠ Devuelve TODAS las filas, sin filtrar: simula una consulta que mañana se rompa. El chokepoint tiene que filtrar igual.
      findMany: async (a: unknown) => {
        db.llamadas.cobros.push(a);
        return db.cobros;
      },
    },
  },
}));

import { estadoDeCuentaParaElToken } from "./estado-de-cuenta-view";

const TOKEN_A = "a".repeat(64);
const AHORA = new Date("2026-11-13T15:00:00Z");

const fila = (cuentaId: string, x: Record<string, unknown> = {}) => ({
  cuentaId,
  estado: "POR_COBRAR",
  periodo: "2026-10",
  fechaProgramada: new Date("2026-10-01T00:00:00Z"),
  fechaEmision: new Date("2026-10-01T00:00:00Z"),
  fechaCobro: null,
  numeroFactura: cuentaId === "cuentaA" ? "FAC-0100" : "FAC-0200",
  monto: 1000,
  moneda: "USD",
  servicio: { cuentaId, tipoServicio: "SUSCRIPCION" },
  // Lo interno que una fila podría traer si alguien cambia el select: nada de esto puede salir.
  notas: "NOTA INTERNA: el gerente no contesta",
  promesaPago: new Date("2026-11-30T00:00:00Z"),
  confirmadoPor: "maria.jose@smarteam.example",
  referenciaExterna: "DEP-INTERNO-77",
  ...x,
});

beforeEach(() => {
  db.acceso = { id: "acc1", cuentaId: "cuentaA", revokedAt: null, venceEn: new Date("2027-01-01T00:00:00Z") };
  db.cuentas = {
    cuentaA: { id: "cuentaA", moneda: "USD", creditoDias: 15, razonSocial: "Empresa A S.A.", client: { name: "Empresa A" } },
    cuentaB: { id: "cuentaB", moneda: "USD", creditoDias: 15, razonSocial: null, client: { name: "Empresa B" } },
  };
  db.cobros = [fila("cuentaA"), fila("cuentaB", { monto: 99999 })];
  db.llamadas = { cuenta: [], cobros: [], update: [] };
});

describe("E1 · el chokepoint", () => {
  it("un token sin la forma de uno no toca la base", async () => {
    db.acceso = null;
    expect(await estadoDeCuentaParaElToken("cuentaB")).toBeNull();
    expect(await estadoDeCuentaParaElToken("A".repeat(64))).toBeNull();
    expect(db.llamadas.cobros).toHaveLength(0);
  });

  it("revocado → null (el 404 neutro), sin leer la cuenta", async () => {
    db.acceso!.revokedAt = new Date("2026-11-01T00:00:00Z");
    expect(await estadoDeCuentaParaElToken(TOKEN_A, AHORA)).toBeNull();
    expect(db.llamadas.cuenta).toHaveLength(0);
    expect(db.llamadas.cobros).toHaveLength(0);
  });

  it("vencido → dice que venció, sin un solo dato de la cuenta", async () => {
    db.acceso!.venceEn = new Date("2026-11-13T14:59:59Z");
    const r = await estadoDeCuentaParaElToken(TOKEN_A, AHORA);
    expect(r).toEqual({ tipo: "vencido", smarteamLogoUrl: "/logo-smarteam.png" });
    expect(db.llamadas.cuenta).toHaveLength(0);
    expect(db.llamadas.cobros).toHaveLength(0);
    expect(db.llamadas.update).toHaveLength(0);
  });

  it("⛔ pide las cuotas por la cuenta DEL ENLACE, y una cuota de otra cuenta que se cuele no llega a la página", async () => {
    const r = await estadoDeCuentaParaElToken(TOKEN_A, AHORA);
    expect(r?.tipo).toBe("ok");
    if (r?.tipo !== "ok") return;
    expect((db.llamadas.cobros[0] as { where: { cuentaId: string } }).where.cuentaId).toBe("cuentaA");
    expect((db.llamadas.cuenta[0] as { where: { id: string } }).where.id).toBe("cuentaA");
    expect(r.data.empresa).toBe("Empresa A");
    expect(r.data.estado.totales).toEqual([expect.objectContaining({ moneda: "USD", facturado: 1000 })]);
    const json = JSON.stringify(r);
    expect(json).not.toContain("cuentaB");
    expect(json).not.toContain("Empresa B");
    expect(json).not.toContain("99999");
  });

  it("⛔ una cuota cuyo SERVICIO es de otra cuenta tampoco entra", async () => {
    db.cobros = [fila("cuentaA", { servicio: { cuentaId: "cuentaB", tipoServicio: "WEB" }, numeroFactura: "COLADA" })];
    const r = await estadoDeCuentaParaElToken(TOKEN_A, AHORA);
    expect(JSON.stringify(r)).not.toContain("COLADA");
  });

  it("⛔ nada interno sale, aunque la fila lo traiga", async () => {
    const json = JSON.stringify(await estadoDeCuentaParaElToken(TOKEN_A, AHORA));
    for (const interno of ["NOTA INTERNA", "2026-11-30", "maria.jose", "DEP-INTERNO-77", "acc1", "cuentaA"]) {
      expect(json, interno).not.toContain(interno);
    }
  });

  it("registra la vista (última y cuántas)", async () => {
    await estadoDeCuentaParaElToken(TOKEN_A, AHORA);
    expect(db.llamadas.update[0]).toEqual({ where: { id: "acc1" }, data: { lastUsedAt: AHORA, vistas: { increment: 1 } } });
  });
});

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

describe("E2 · estructurales", () => {
  it("la página es dinámica (en vivo, revocar surte efecto), noindex, y solo pasa por el chokepoint", () => {
    const p = leer("app/external/estado-de-cuenta/[token]/page.tsx");
    expect(p).toMatch(/export const dynamic = "force-dynamic"/);
    expect(p).toMatch(/index: false/);
    expect(p).toMatch(/estadoDeCuentaParaElToken\(token\)/);
    expect(p).not.toMatch(/@\/lib\/db\/prisma|@\/lib\/cobranza\/queries/);
    expect(leer("components/external/EstadoDeCuentaClientView.tsx")).not.toMatch(/@\/lib\/db\/prisma/);
  });

  it("⛔ el chokepoint lee con una lista cerrada de columnas y sin las internas", () => {
    const v = leer("lib/external/estado-de-cuenta-view.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(v).not.toMatch(/include\s*:/);
    for (const interno of ["notas", "promesaPago", "confirmadoPor", "facturadoPor", "referenciaExterna", "numeroFacturaPor", "sinNumeroFacturaMotivo", "correoCobro", "bitacora", "alertas", "atribucion", "cedulaJuridica"]) {
      expect(v, interno).not.toContain(interno);
    }
  });

  it("⛔ la ruta interna pide EDITAR Cobranza en cada handler, antes de todo", () => {
    const r = leer("app/api/cobranza/cuentas/[cuentaId]/estado-de-cuenta/route.ts");
    const handlers = [...r.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)];
    expect(handlers.map((h) => h[1]).sort()).toEqual(["DELETE", "GET", "POST"]);
    for (const [, nombre, cuerpo] of handlers) {
      const primera = cuerpo.trim().split("\n")[0];
      expect(primera, nombre).toMatch(/await guardCobranzaEditor\(\)/);
    }
  });

  it("la superficie vive bajo /external/, que el middleware deja pasar sin sesión (la seguridad es el token)", () => {
    expect(leer("middleware.ts")).toMatch(/"\/external\/"/);
  });
});
