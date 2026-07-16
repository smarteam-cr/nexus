/**
 * lib/cobranza/costos-privacy.test.ts — TESTS PERMANENTES DE PRIVACIDAD (fase 4).
 *
 * Los costos recurrentes (salarios estimados) son la información más sensible
 * del sistema: SOLO SUPER_ADMIN. RLS no protege del interno (Prisma conecta con
 * rol BYPASSRLS) — la barrera son los guards, y estos tests son lo que FRENA un
 * merge que la rompa (un comentario "NUNCA include acá" no frena nada).
 *
 * Tres niveles (condición explícita del usuario, 2026-07-11):
 *   P1 — guardCostosAccess devuelve 403 para TODO rol que no sea SUPER_ADMIN.
 *   P2 — los 5 handlers reales de costos/caja-neta responden 403 como ADMIN
 *        SIN tocar Prisma (el mock de prisma LANZA si algo lo toca).
 *   P3 — estructurales: toda route bajo costos y caja-neta invoca el guard en
 *        cada handler; TEAM_MEMBER_SAFE_SELECT es un allowlist escalar sin la
 *        relación costosRecurrentes; las routes de team no usan `include`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { TeamRole } from "@prisma/client";

// ── Mocks (hoisted) ─────────────────────────────────────────────────────────
const { requireInternalUserMock, prismaTouched } = vi.hoisted(() => ({
  requireInternalUserMock: vi.fn(),
  prismaTouched: [] as string[],
}));

// Identidad mockeada: el test controla qué rol "está logueado".
vi.mock("@/lib/auth/supabase", () => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  class NotImplementedError extends Error {}
  return {
    UnauthorizedError,
    ForbiddenError,
    NotImplementedError,
    requireUser: vi.fn(),
    requireInternalUser: requireInternalUserMock,
    requireExternalUser: vi.fn(),
  };
});

// Prisma-que-lanza: si un handler llega a la DB con un rol no autorizado, el
// test explota con la propiedad tocada — prueba que el guard corta ANTES.
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        prismaTouched.push(String(prop));
        throw new Error(
          `PRIVACIDAD ROTA: un handler tocó prisma.${String(prop)} sin pasar el guard`,
        );
      },
    },
  ),
}));

import { guardCostosAccess } from "@/lib/auth/api-guards";
import { COSTOS_ROLES } from "@/lib/auth/cobranza-roles";
import { TEAM_MEMBER_SAFE_SELECT } from "@/lib/cache/team";
import * as costosRoute from "@/app/api/cobranza/costos/route";
import * as costoIdRoute from "@/app/api/cobranza/costos/[costoId]/route";
import * as cajaNetaRoute from "@/app/api/cobranza/caja-neta/route";
import * as gastosRoute from "@/app/api/cobranza/gastos/route";
import * as gastoIdRoute from "@/app/api/cobranza/gastos/[gastoId]/route";
import * as movimientosRoute from "@/app/api/cobranza/costos/movimientos/route";

const MENSAJE_GUARD = "Los costos y la caja neta son solo para dirección (Super Admin).";

function loginAs(role: TeamRole) {
  requireInternalUserMock.mockResolvedValue({
    user: { id: "user-test", email: "test@smarteam.cr", kind: "INTERNAL" },
    teamMember: { id: "tm-test", name: "Test", email: "test@smarteam.cr", roleEnum: role },
    role,
  });
}

beforeEach(() => {
  requireInternalUserMock.mockReset();
  prismaTouched.length = 0;
});

// ── P1 · Guard por rol ──────────────────────────────────────────────────────
describe("P1 · guardCostosAccess — 403 para todo rol que no sea SUPER_ADMIN", () => {
  // Derivado del enum: un rol NUEVO agregado a TeamRole queda cubierto solo.
  const rolesSinAcceso = Object.values(TeamRole).filter((r) => r !== "SUPER_ADMIN");

  it("la tabla cubre el enum completo (ADMIN incluido)", () => {
    expect(rolesSinAcceso).toContain("ADMIN");
    expect(rolesSinAcceso.length).toBe(Object.values(TeamRole).length - 1);
  });

  for (const role of rolesSinAcceso) {
    it(`${role} → NextResponse 403 sin datos en el body`, async () => {
      loginAs(role);
      const guard = await guardCostosAccess();
      expect(guard).toBeInstanceOf(NextResponse);
      const res = guard as NextResponse;
      expect(res.status).toBe(403);
      const body = await res.json();
      // Solo el mensaje — ni montos, ni ids, ni bundle de usuario.
      expect(Object.keys(body)).toEqual(["error"]);
      expect(body.error).toBe(MENSAJE_GUARD);
    });
  }

  it("SUPER_ADMIN → bundle (pasa)", async () => {
    loginAs("SUPER_ADMIN");
    const guard = await guardCostosAccess();
    expect(guard).not.toBeInstanceOf(NextResponse);
    expect((guard as { role: TeamRole }).role).toBe("SUPER_ADMIN");
  });

  it("COSTOS_ROLES es exactamente ['SUPER_ADMIN'] (fuente única)", () => {
    expect([...COSTOS_ROLES]).toEqual(["SUPER_ADMIN"]);
  });
});

// ── P2 · Handlers reales cableados ──────────────────────────────────────────
describe("P2 · los 10 handlers responden 403 como ADMIN sin tocar Prisma", () => {
  const req = (method: string) =>
    new Request("http://test.local/api/cobranza", {
      method,
      headers: { "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify({}),
    }) as unknown as NextRequest;
  const params = { params: Promise.resolve({ costoId: "clx-test-costo-id" }) };
  const gastoParams = { params: Promise.resolve({ gastoId: "clx-test-gasto-id" }) };

  const superficies: Array<[string, () => Promise<Response>]> = [
    ["GET /api/cobranza/costos", () => costosRoute.GET()],
    ["POST /api/cobranza/costos", () => costosRoute.POST(req("POST"))],
    ["PATCH /api/cobranza/costos/[costoId]", () => costoIdRoute.PATCH(req("PATCH"), params)],
    ["DELETE /api/cobranza/costos/[costoId]", () => costoIdRoute.DELETE(req("DELETE"), params)],
    ["GET /api/cobranza/caja-neta", () => cajaNetaRoute.GET()],
    ["GET /api/cobranza/gastos", () => gastosRoute.GET()],
    ["POST /api/cobranza/gastos", () => gastosRoute.POST(req("POST"))],
    ["PATCH /api/cobranza/gastos/[gastoId]", () => gastoIdRoute.PATCH(req("PATCH"), gastoParams)],
    ["DELETE /api/cobranza/gastos/[gastoId]", () => gastoIdRoute.DELETE(req("DELETE"), gastoParams)],
    ["GET /api/cobranza/costos/movimientos", () => movimientosRoute.GET()],
  ];

  for (const [nombre, invocar] of superficies) {
    it(`${nombre} → 403 (nunca 404) y cero queries`, async () => {
      loginAs("ADMIN");
      const res = await invocar();
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: MENSAJE_GUARD });
      expect(prismaTouched).toEqual([]);
    });
  }
});

// ── P3 · Estructurales (anti-futuro) ────────────────────────────────────────
describe("P3 · estructurales", () => {
  const raiz = process.cwd();

  function routesBajo(dir: string): string[] {
    const abs = path.join(raiz, dir);
    if (!fs.existsSync(abs)) return [];
    const encontradas: string[] = [];
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name === "route.ts") encontradas.push(p);
      }
    };
    walk(abs);
    return encontradas;
  }

  it("toda route bajo costos/gastos/caja-neta invoca guardCostosAccess en CADA handler", () => {
    const rutas = [
      ...routesBajo("app/api/cobranza/costos"),
      ...routesBajo("app/api/cobranza/gastos"),
      ...routesBajo("app/api/cobranza/caja-neta"),
    ];
    // Si alguien borra/renombra las carpetas, esto avisa en vez de pasar vacío.
    expect(rutas.length).toBeGreaterThanOrEqual(6);

    for (const ruta of rutas) {
      const src = fs.readFileSync(ruta, "utf8");
      const handlers = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)/g)];
      expect(handlers.length, `${ruta} sin handlers exportados`).toBeGreaterThan(0);
      for (let i = 0; i < handlers.length; i++) {
        const desde = handlers[i].index!;
        const hasta = i + 1 < handlers.length ? handlers[i + 1].index! : src.length;
        const cuerpo = src.slice(desde, hasta);
        expect(
          cuerpo.includes("guardCostosAccess("),
          `${path.relative(raiz, ruta)} — handler ${handlers[i][1]} SIN guardCostosAccess`,
        ).toBe(true);
      }
    }
  });

  it("TEAM_MEMBER_SAFE_SELECT: allowlist escalar exacto, sin relaciones", () => {
    const esperado = [
      "id",
      "name",
      "email",
      "area",
      "roleEnum",
      "photoUrl",
      "canViewAllClients",
      "canViewAllExpiresAt",
      "deactivatedAt",
      "deactivatedReason",
      "createdAt",
      "updatedAt",
    ];
    expect(Object.keys(TEAM_MEMBER_SAFE_SELECT).sort()).toEqual([...esperado].sort());
    // Todo valor es `true` plano: sin select/include anidado que cuele una relación.
    for (const v of Object.values(TEAM_MEMBER_SAFE_SELECT)) expect(v).toBe(true);
    // Las relaciones de TeamMember, explícitamente fuera.
    for (const relacion of [
      "costosRecurrentes",
      "appUser",
      "clientAssignments",
      "grantedAssignments",
      "externalAccessesCreated",
    ]) {
      expect(relacion in TEAM_MEMBER_SAFE_SELECT, `${relacion} no va en el select`).toBe(false);
    }
  });

  it("las routes de team usan el select seguro y jamás `include`", () => {
    for (const rel of ["app/api/team/route.ts", "app/api/team/[id]/route.ts"]) {
      const src = fs.readFileSync(path.join(raiz, rel), "utf8");
      expect(/\binclude\s*:/.test(src), `${rel} usa include`).toBe(false);
      expect(src.includes("costosRecurrentes"), `${rel} menciona la relación de costos`).toBe(
        false,
      );
      expect(src.includes("TEAM_MEMBER_SAFE_SELECT"), `${rel} no usa el select seguro`).toBe(true);
    }
  });

  it("policies.sql tiene deny-all RESTRICTIVE para las tablas sensibles de costos", () => {
    const sql = fs.readFileSync(path.join(raiz, "prisma/policies.sql"), "utf8");
    // Un merge que agregue una tabla de costos sin su policy RLS ROMPE esto
    // (RLS es la única capa ante el anon externo — Prisma bypassa para el interno).
    for (const tabla of ["CostoRecurrente", "GastoPuntual", "CostoMovimiento"]) {
      const re = new RegExp(
        `CREATE POLICY deny_all_non_superuser ON "${tabla}"[\\s\\S]*?AS RESTRICTIVE`,
      );
      expect(re.test(sql), `${tabla} sin deny_all_non_superuser RESTRICTIVE en policies.sql`).toBe(
        true,
      );
    }
  });
});

// ── P4 · Páginas de Finanzas (Pieza 1, tanda 2026-07) ───────────────────────
describe("P4 · las páginas /finanzas/costos y /finanzas/caja-neta gatean ANTES de cargar datos", () => {
  const raiz = process.cwd();

  for (const rel of ["app/finanzas/costos/page.tsx", "app/finanzas/caja-neta/page.tsx"]) {
    it(`${rel}: isCostosRole corta antes de cualquier load*`, () => {
      const abs = path.join(raiz, rel);
      expect(fs.existsSync(abs), `${rel} no existe`).toBe(true);
      const src = fs.readFileSync(abs, "utf8");
      expect(src.includes("isCostosRole("), `${rel} no invoca isCostosRole`).toBe(true);

      const idxGate = src.indexOf("isCostosRole(");
      const llamadasLoad = [...src.matchAll(/\bload(Costos|CajaNeta|Gastos)\(/g)];
      expect(llamadasLoad.length, `${rel} no llama a ningún load*`).toBeGreaterThan(0);
      for (const m of llamadasLoad) {
        expect(
          m.index! > idxGate,
          `${rel} — ${m[0]} aparece ANTES del gate isCostosRole`,
        ).toBe(true);
      }
    });
  }
});
