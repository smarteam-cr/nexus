/**
 * lib/finanzas/tarjetas-eliminar.test.ts — ELIMINAR UNA TARJETA: SOLO QUIEN SUPERVISA, Y CON CONFIRMACIÓN (2026-10-05).
 *
 * Correr: `npx vitest run --project unit lib/finanzas/tarjetas-eliminar.test.ts`.
 *
 * Eliminar una tarjeta era un clic de cualquiera con `gastos.write`, y se llevaba sus cortes (CASCADE) sin
 * decirlo. Ahora la ruta de quien registra (/api/finanzas/tarjetas/[tarjetaId]) la deja EDITAR a quien
 * registra pero ELIMINAR solo a quien supervisa Finanzas (la misma condición que `guardSupervisionFinanzas`),
 * y la pantalla pide confirmación diciendo cuántos cortes y costos se van con ella. La edición que la pone
 * en rojo: sacar el `isCostosRole(guard.role)` del DELETE, o volver a llamar `borrarTarjeta` desde el botón.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { textoDeEliminarTarjeta } from "@/lib/cobranza/tarjetas";

const { db, guards } = vi.hoisted(() => ({
  db: {
    tarjetaCredito: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
  guards: { guardGastosEditor: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guards", () => guards);
vi.mock("@/lib/para-ti/avisos-server", () => ({ avisar: vi.fn() }));
// mutations.ts importa los cargadores de Cobranza; acá no se usan.
vi.mock("@/lib/cobranza/queries", () => ({}));

import { DELETE, PATCH } from "@/app/api/finanzas/tarjetas/[tarjetaId]/route";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const params = { params: Promise.resolve({ tarjetaId: "t1" }) };
const pedido = (method: string, body?: unknown) =>
  new Request("http://localhost/api/finanzas/tarjetas/t1", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
const como = (role: string) => guards.guardGastosEditor.mockResolvedValue({ user: { email: "x@smarteamcr.com" }, role });

beforeEach(() => {
  for (const fn of Object.values(db.tarjetaCredito)) fn.mockReset();
  guards.guardGastosEditor.mockReset();
  db.tarjetaCredito.findUnique.mockResolvedValue({ id: "t1" });
  db.tarjetaCredito.update.mockResolvedValue({ id: "t1" });
  db.tarjetaCredito.delete.mockResolvedValue({ id: "t1" });
});

describe("⭐ eliminar una tarjeta es de quien supervisa Finanzas", () => {
  it("quien registra (ADMIN) recibe 403 con el motivo, y la tarjeta (con sus cortes) sigue ahí", async () => {
    como("ADMIN");
    const res = await DELETE(pedido("DELETE"), params);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toContain("quien supervisa Finanzas");
    expect(db.tarjetaCredito.delete).not.toHaveBeenCalled();
  });

  it("quien registra la sigue pudiendo editar", async () => {
    como("ADMIN");
    const res = await PATCH(pedido("PATCH", { alias: "VISA nueva" }), params);
    expect(res.status).toBe(200);
    expect(db.tarjetaCredito.update).toHaveBeenCalledTimes(1);
  });

  it("quien supervisa (SUPER_ADMIN) la elimina", async () => {
    como("SUPER_ADMIN");
    const res = await DELETE(pedido("DELETE"), params);
    expect(res.status).toBe(200);
    expect(db.tarjetaCredito.delete).toHaveBeenCalledTimes(1);
  });

  it("es la MISMA condición que `guardSupervisionFinanzas`", () => {
    const apiGuards = sinComentarios(leer("lib/auth/api-guards.ts"));
    const i = apiGuards.indexOf("export async function guardSupervisionFinanzas(");
    expect(i, "se movió guardSupervisionFinanzas").toBeGreaterThan(-1);
    expect(apiGuards.slice(i, apiGuards.indexOf("\n}", i))).toContain("if (!isCostosRole(guard.role))");
    const ruta = sinComentarios(leer("app/api/finanzas/tarjetas/[tarjetaId]/route.ts"));
    const borrar = ruta.slice(ruta.indexOf("export async function DELETE("));
    expect(borrar.indexOf("if (!isCostosRole(guard.role))"), "el DELETE no pide supervisión").toBeGreaterThan(-1);
    expect(borrar.indexOf("if (!isCostosRole(guard.role))")).toBeLessThan(borrar.indexOf("deleteTarjeta("));
  });
});

describe("⭐ la pantalla confirma y dice qué se lleva", () => {
  it("el texto dice cuántos cortes se borran y cuántos costos se desligan (y que no vuelve)", () => {
    expect(textoDeEliminarTarjeta({ alias: "VISA Alex", cortes: 7, costos: 3 })).toBe(
      "Eliminar «VISA Alex». Se borran con ella sus 7 cortes registrados (los estados de cuenta transcritos). Los 3 costos que tiene asignados dejan de estar ligados a ella, pero siguen vivos. No se puede deshacer.",
    );
    expect(textoDeEliminarTarjeta({ alias: "MC", cortes: 1, costos: 1 })).toContain("su corte registrado");
    expect(textoDeEliminarTarjeta({ alias: "MC", cortes: 0, costos: 0 })).toBe("Eliminar «MC». No tiene cortes registrados. No se puede deshacer.");
    // Sin contar, no se dice «0»: se dice que se van todos.
    expect(textoDeEliminarTarjeta({ alias: "MC", cortes: null, costos: 0 })).toContain("todos sus cortes registrados");
  });

  it("«Eliminar» abre la confirmación (no borra) y solo se ofrece a quien puede", () => {
    const panel = sinComentarios(leer("components/finanzas/TarjetasPanel.tsx"));
    expect(panel).toContain("onBorrar={puedeEliminar ? () => setPorEliminar(t) : null}");
    expect(panel).toContain("onConfirm={() => (porEliminar ? borrarTarjeta(porEliminar) : undefined)}");
    expect(panel).toContain("textoDeEliminarTarjeta({ alias: porEliminar.alias, cortes: porEliminar.cortes, costos: porEliminar.costos.length })");
    expect(panel.match(/borrarTarjeta\(/g)?.length, "otro lugar llama a borrarTarjeta sin confirmar").toBe(2);
    const pagina = sinComentarios(leer("app/(shell)/finanzas/tarjetas/page.tsx"));
    expect(pagina).toContain("const supervisa = isCostosRole(ctx.role);");
    expect(pagina).toContain("puedeEliminar={supervisa}");
  });
});
