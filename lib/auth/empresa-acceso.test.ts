import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * lib/auth/empresa-acceso.test.ts — la EMPRESA arriba de sus unidades la abre quien abre alguna de sus unidades (paso 10
 * de requireAccessToClient y clientesQueNoAbre, 2026-11-26). Contra una base simulada: la CSE es dueña de un proyecto de AE.
 * Correr: `npx vitest run lib/auth/empresa-acceso.test.ts --project unit`.
 */
const h = vi.hoisted(() => ({ duenaDe: new Set<string>(["ae"]), unidades: ["tae", "ae"] }));

vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({
  requireInternalUser: async () => ({ user: { id: "u" }, teamMember: { id: "t", email: "hei@smarteamcr.com", roleEnum: "CSE" } }),
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("./permissions/engine", () => ({ can: async () => false }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    clientAssignment: { findMany: async () => [] },
    project: {
      count: async ({ where }: { where: { clientId: string } }) => (h.duenaDe.has(where.clientId) ? 1 : 0),
      findMany: async ({ where }: { where: { clientId: { in: string[] } } }) => where.clientId.in.filter((id) => h.duenaDe.has(id)).map((clientId) => ({ clientId })),
    },
    client: {
      findFirst: async ({ where }: { where: { id: string } }) => (where.id === "tec" ? { entidadesDelDominio: h.unidades.map((id) => ({ id })) } : null),
      findMany: async ({ where }: { where: { id: { in: string[] }; kind?: string } }) =>
        where.kind === "EMPRESA" ? where.id.in.filter((id) => id === "tec").map((id) => ({ id, entidadesDelDominio: h.unidades.map((u) => ({ id: u })) })) : [],
      count: async () => 0,
    },
    teamMember: { findUnique: async () => ({ id: "t", email: "hei@smarteamcr.com", roleEnum: "CSE", permissionOverrides: null, canViewAllClients: false, canViewAllExpiresAt: null, deactivatedAt: null }) },
    exploracionDeVenta: { count: async () => 0, findMany: async () => [] },
  },
}));

import { clientesQueNoAbre, requireAccessToClient } from "./access";

beforeEach(() => {
  h.duenaDe = new Set(["ae"]);
});

describe("la empresa arriba de sus unidades", () => {
  it("la abre quien abre una de sus unidades; las otras unidades siguen cerradas", async () => {
    await expect(requireAccessToClient("tec")).resolves.toMatchObject({ reason: "empresa-de-una-unidad" });
    await expect(requireAccessToClient("ae")).resolves.toMatchObject({ reason: "hubspot-owner" });
    await expect(requireAccessToClient("tae")).rejects.toThrow(/Sin acceso/);
  });

  it("sin ninguna unidad suya, la empresa tampoco se abre", async () => {
    h.duenaDe = new Set();
    await expect(requireAccessToClient("tec")).rejects.toThrow(/Sin acceso/);
  });

  it("clientesQueNoAbre dice lo mismo", async () => {
    const noAbre = await clientesQueNoAbre("t", ["tec", "tae", "ae"]);
    expect([...noAbre]).toEqual(["tae"]);
    h.duenaDe = new Set();
    expect([...(await clientesQueNoAbre("t", ["tec"]))]).toEqual(["tec"]);
  });
});
