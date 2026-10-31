import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Una cuenta con solo proyectos técnicos la abre Customer Success, y nadie más (Elías, 2026-10-30). Los tres caminos de
 * lib/auth/access.ts, contra una base simulada: la cuenta es técnica si `client.count`/`findMany` la devuelve.
 */
const h = vi.hoisted(() => ({
  tm: {} as Record<string, unknown>,
  asignaciones: [] as { clientId: string; kind: "GRANT" | "REVOKE" }[],
  tecnica: true,
  consultas: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({
  requireInternalUser: async () => ({ user: { id: "u" }, teamMember: h.tm }),
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("./permissions/engine", () => ({ can: async () => false }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    clientAssignment: { findMany: async ({ where }: { where: { kind?: string } }) => h.asignaciones.filter((a) => !where.kind || a.kind === where.kind) },
    project: { count: async () => 0, findMany: async () => [] },
    client: {
      count: async () => {
        h.consultas++;
        return h.tecnica ? 1 : 0;
      },
      findMany: async () => {
        h.consultas++;
        return h.tecnica ? [{ id: "c1" }] : [];
      },
    },
    teamMember: { findUnique: async () => h.tm },
    exploracionDeVenta: { count: async () => 0, findMany: async () => [] },
  },
}));

import { accessibleClientWhere, clientesQueNoAbre, requireAccessToClient } from "./access";
import { pipelineKeyDeProyecto } from "@/lib/agents/resolver";
import { pipelineByKey } from "@/lib/projects/kind";
import { debeAnteponerSemanaCero } from "@/lib/timeline/semana-cero";

const persona = (roleEnum: string) => ({ id: "t", email: "x@smarteamcr.com", roleEnum, permissionOverrides: null, canViewAllClients: false, canViewAllExpiresAt: null, deactivatedAt: null });

beforeEach(() => {
  h.tm = persona("CSE");
  h.asignaciones = [];
  h.tecnica = true;
  h.consultas = 0;
});

describe("«Acompañamiento técnico» tiene el trato de Desarrollo", () => {
  const def = pipelineByKey("acompanamiento-tecnico");

  it("usa los agentes de Desarrollo y sin Semana 0", () => {
    expect(pipelineKeyDeProyecto(def.hubspotPipelineId)).toBe("development");
    expect(debeAnteponerSemanaCero(def.hubspotPipelineId, "Levantamiento")).toBe(false);
  });

  it("las piezas con las que nace son las que aplican: requerimientos sí, kickoff no", () => {
    expect(def.seedPieces).toContain("tech-requirements");
    expect(def.seedPieces).not.toContain("kickoff");
  });

  it("no suma a la cartera de CS", () => {
    expect(def.base.carteraCs).toBe(false);
  });
});

describe("requireAccessToClient", () => {
  it.each(["CSE", "CSL"])("%s abre una cuenta con solo proyectos técnicos", async (rol) => {
    h.tm = persona(rol);
    await expect(requireAccessToClient("c1")).resolves.toMatchObject({ reason: "cuenta-tecnica" });
  });

  it("⛔ una cuenta con proyectos de CS sigue cerrada para un CSE que no es su dueño", async () => {
    h.tecnica = false;
    await expect(requireAccessToClient("c1")).rejects.toThrow("Sin acceso");
  });

  it.each(["ADMIN", "VENTAS", "MARKETING", "DEV"])("⛔ %s no entra por esta regla: ni se consulta", async (rol) => {
    h.tm = persona(rol);
    await expect(requireAccessToClient("c1")).rejects.toThrow("Sin acceso");
    expect(h.consultas).toBe(0);
  });

  it("⛔ un REVOKE sigue cortando antes", async () => {
    h.asignaciones = [{ clientId: "c1", kind: "REVOKE" }];
    await expect(requireAccessToClient("c1")).rejects.toThrow("revocado");
  });
});

describe("el listado y el lote dicen lo mismo", () => {
  const usuario = () => ({ kind: "INTERNAL", teamMember: h.tm }) as never;

  it("el listado la suma para Customer Success y no para otro rol", async () => {
    expect(JSON.stringify(await accessibleClientWhere(usuario()))).toContain("hubspotPipelineId");
    h.tm = persona("ADMIN");
    const otro = JSON.stringify(await accessibleClientWhere(usuario()));
    expect(otro).not.toContain('"none"');
  });

  it("el lote la abre para un CSE, y un REVOKE la cierra", async () => {
    expect(await clientesQueNoAbre("t", ["c1"])).toEqual(new Set());
    h.asignaciones = [{ clientId: "c1", kind: "REVOKE" }];
    expect(await clientesQueNoAbre("t", ["c1"])).toEqual(new Set(["c1"]));
  });

  it("el lote no la abre para otro rol", async () => {
    h.tm = persona("ADMIN");
    expect(await clientesQueNoAbre("t", ["c1"])).toEqual(new Set(["c1"]));
  });
});
