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

import {
  visibleRoleWhere,
  canReadRoleDoc,
  canEditRoleDocs,
  esAdminDeRoles,
  hasSharedRoleDocs,
} from "./access";

const SA = { role: "SUPER_ADMIN", teamMemberId: "tm-dir" };
const CSL = { role: "CSL", teamMemberId: "tm-csl" };
const CSE = { role: "CSE", teamMemberId: "tm-cse" };

/** Los roles que NO administran la sección: solo leen lo que les compartan. */
const SIN_ADMIN = ["CSE", "ADMIN", "VENTAS", "DEV", "MARKETING", "PM"];

beforeEach(() => {
  findFirstMock.mockReset();
  sharesFindFirstMock.mockReset();
});

describe("visibleRoleWhere", () => {
  it("quien ADMINISTRA la sección ve todo (where vacío)", () => {
    expect(visibleRoleWhere(SA)).toEqual({});
    // El CSL administra Roles desde 2026-09-23 y por eso ve todo. No es cosmético: sin esta
    // línea podría CREAR un documento que después no puede abrir, y `guardRolesAdmin` —que
    // no recibe el id— dejaría de estar contenido.
    expect(visibleRoleWhere(CSL)).toEqual({});
  });

  it("cualquier otro rol ve SOLO lo que le compartieron", () => {
    expect(visibleRoleWhere(CSE)).toEqual({ shares: { some: { teamMemberId: "tm-cse" } } });
    for (const role of SIN_ADMIN) {
      expect(visibleRoleWhere({ role, teamMemberId: "tm-x" }), `${role} no debería ver todo`).toEqual({
        shares: { some: { teamMemberId: "tm-x" } },
      });
    }
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

describe("esAdminDeRoles / canEditRoleDocs", () => {
  it("administran dirección y el CSL; el resto solo lee lo compartido", () => {
    for (const role of ["SUPER_ADMIN", "CSL"]) {
      expect(esAdminDeRoles({ role }), `${role} debería administrar`).toBe(true);
    }
    for (const role of SIN_ADMIN) {
      expect(esAdminDeRoles({ role }), `${role} no debería administrar`).toBe(false);
    }
  });

  it("canEditRoleDocs es la MISMA regla, no una copia que puede derivar", () => {
    for (const role of ["SUPER_ADMIN", "CSL", ...SIN_ADMIN]) {
      expect(canEditRoleDocs({ role }), role).toBe(esAdminDeRoles({ role }));
    }
  });

  it("ADMINISTRAR y VER son la misma respuesta (o guardRolesAdmin se queda corto)", () => {
    // `guardRolesAdmin` no recibe el id del documento. Eso es correcto SOLO mientras quien
    // administra vea todo: un rol que administrara con visibilidad parcial podría tocar
    // documentos ajenos probando ids en la URL. Las dos mitades se mueven juntas.
    for (const role of ["SUPER_ADMIN", "CSL", ...SIN_ADMIN]) {
      const veTodo = Object.keys(visibleRoleWhere({ role, teamMemberId: "tm-x" })).length === 0;
      expect(veTodo, `${role}: administra=${esAdminDeRoles({ role })} pero veTodo=${veTodo}`).toBe(
        esAdminDeRoles({ role }),
      );
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
