/**
 * lib/roles/access.test.ts — quién ve qué en /roles.
 *
 * ── QUÉ PROTEGE ──────────────────────────────────────────────────────────────
 * Estos documentos llevan ofertas salariales. La única barrera contra un rol INTERNO es
 * `visibleRoleWhere` (Prisma conecta con BYPASSRLS: las policies solo tapan al `anon` de
 * Supabase). Y el filtro tiene que ser UNO: si "qué lista veo" y "puedo abrir este" se
 * implementaran por separado, tarde o temprano dirían cosas distintas — por eso el test
 * verifica que `canReadRoleDoc` COMPONE el where, no que lo re-implemente.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { findFirstMock, sharesFindFirstMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  sharesFindFirstMock: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    roleProfile: { findFirst: findFirstMock },
    roleProfileShare: { findFirst: sharesFindFirstMock },
  },
}));

import { visibleRoleWhere, canReadRoleDoc, canEditRoleDocs, hasSharedRoleDocs } from "./access";

const SA = { role: "SUPER_ADMIN", teamMemberId: "tm-dir" };
const CSE = { role: "CSE", teamMemberId: "tm-cse" };

beforeEach(() => {
  findFirstMock.mockReset();
  sharesFindFirstMock.mockReset();
});

describe("visibleRoleWhere", () => {
  it("SUPER_ADMIN ve todo (where vacío)", () => {
    expect(visibleRoleWhere(SA)).toEqual({});
  });

  it("cualquier otro rol ve SOLO lo que le compartieron", () => {
    expect(visibleRoleWhere(CSE)).toEqual({ shares: { some: { teamMemberId: "tm-cse" } } });
  });

  it("el filtro es por PERSONA, no por rol: dos CSE no comparten visibilidad", () => {
    const otro = visibleRoleWhere({ role: "CSE", teamMemberId: "tm-otro" });
    expect(otro).not.toEqual(visibleRoleWhere(CSE));
  });
});

describe("canReadRoleDoc", () => {
  it("compone el MISMO where (no re-implementa la regla)", async () => {
    findFirstMock.mockResolvedValue({ id: "doc-1" });
    await canReadRoleDoc(CSE, "doc-1");
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: "doc-1", ...visibleRoleWhere(CSE) },
      select: { id: true },
    });
  });

  it("sin fila visible responde false (el caller traduce a 404, no a 403)", async () => {
    findFirstMock.mockResolvedValue(null);
    expect(await canReadRoleDoc(CSE, "doc-ajeno")).toBe(false);
  });
});

describe("canEditRoleDocs", () => {
  it("editar es SOLO de dirección: compartir da lectura", () => {
    expect(canEditRoleDocs({ role: "SUPER_ADMIN" })).toBe(true);
    for (const role of ["CSE", "CSL", "ADMIN", "VENTAS", "DEV", "MARKETING", "PM"]) {
      expect(canEditRoleDocs({ role }), `${role} no debería poder editar`).toBe(false);
    }
  });
});

describe("hasSharedRoleDocs", () => {
  it("pregunta por EXISTENCIA (findFirst), no cuenta filas", async () => {
    sharesFindFirstMock.mockResolvedValue({ id: "s1" });
    expect(await hasSharedRoleDocs("tm-cse")).toBe(true);
    expect(sharesFindFirstMock).toHaveBeenCalledWith({
      where: { teamMemberId: "tm-cse" },
      select: { id: true },
    });
  });

  it("sin nada compartido responde false (el ítem del sidebar queda apagado)", async () => {
    sharesFindFirstMock.mockResolvedValue(null);
    expect(await hasSharedRoleDocs("tm-solo")).toBe(false);
  });
});
