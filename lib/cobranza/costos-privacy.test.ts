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
import * as tarjetasRoute from "@/app/api/cobranza/costos/tarjetas/route";
import * as tarjetaIdRoute from "@/app/api/cobranza/costos/tarjetas/[tarjetaId]/route";
import * as tarjetaSaldoRoute from "@/app/api/cobranza/costos/tarjetas/[tarjetaId]/saldo/route";
import * as tarjetaCostosRoute from "@/app/api/cobranza/costos/tarjetas/[tarjetaId]/costos/route";
import * as planillaRoute from "@/app/api/cobranza/costos/pagos-planilla/route";
import * as planillaIdRoute from "@/app/api/cobranza/costos/pagos-planilla/[pagoId]/route";
import * as planillaPagarRoute from "@/app/api/cobranza/costos/pagos-planilla/[pagoId]/pagar/route";
import * as aguinaldoRoute from "@/app/api/cobranza/costos/aguinaldo/route";

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
describe("P2 · los 22 handlers responden 403 como ADMIN sin tocar Prisma", () => {
  const req = (method: string) =>
    new Request("http://test.local/api/cobranza", {
      method,
      headers: { "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify({}),
    }) as unknown as NextRequest;
  const params = { params: Promise.resolve({ costoId: "clx-test-costo-id" }) };
  const gastoParams = { params: Promise.resolve({ gastoId: "clx-test-gasto-id" }) };
  const tarjetaParams = { params: Promise.resolve({ tarjetaId: "clx-test-tarjeta-id" }) };
  const pagoParams = { params: Promise.resolve({ pagoId: "clx-test-pago-id" }) };

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
    // Tarjetas de crédito: límite, saldo y con qué se paga cada costo. Cuelgan de
    // `costos/` justamente para entrar al escaneo estructural de P3.
    ["GET /api/cobranza/costos/tarjetas", () => tarjetasRoute.GET()],
    ["POST /api/cobranza/costos/tarjetas", () => tarjetasRoute.POST(req("POST"))],
    [
      "PATCH /api/cobranza/costos/tarjetas/[tarjetaId]",
      () => tarjetaIdRoute.PATCH(req("PATCH"), tarjetaParams),
    ],
    [
      "DELETE /api/cobranza/costos/tarjetas/[tarjetaId]",
      () => tarjetaIdRoute.DELETE(req("DELETE"), tarjetaParams),
    ],
    [
      "PUT /api/cobranza/costos/tarjetas/[tarjetaId]/saldo",
      () => tarjetaSaldoRoute.PUT(req("PUT"), tarjetaParams),
    ],
    [
      "POST /api/cobranza/costos/tarjetas/[tarjetaId]/costos",
      () => tarjetaCostosRoute.POST(req("POST"), tarjetaParams),
    ],
    // Libro de planilla: lo que se le PAGÓ a cada persona. Pesa lo mismo que un
    // salario, así que cuelga de `costos/` con el mismo guard.
    ["GET /api/cobranza/costos/pagos-planilla", () => planillaRoute.GET()],
    ["POST /api/cobranza/costos/pagos-planilla", () => planillaRoute.POST(req("POST"))],
    [
      "PATCH /api/cobranza/costos/pagos-planilla/[pagoId]",
      () => planillaIdRoute.PATCH(req("PATCH"), pagoParams),
    ],
    [
      "DELETE /api/cobranza/costos/pagos-planilla/[pagoId]",
      () => planillaIdRoute.DELETE(req("DELETE"), pagoParams),
    ],
    [
      "PUT /api/cobranza/costos/pagos-planilla/[pagoId]/pagar",
      () => planillaPagarRoute.PUT(req("PUT"), pagoParams),
    ],
    // Aguinaldo: derivado del libro, así que expone remuneraciones igual.
    [
      "GET /api/cobranza/costos/aguinaldo",
      () =>
        aguinaldoRoute.GET(
          new Request("http://test.local/api/cobranza/costos/aguinaldo?anio=2026") as unknown as NextRequest,
        ),
    ],
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
    // ⚠ `ComisionPartner` NO va en esta lista a propósito: es un INGRESO y su
    // superficie es la de ADMIN, igual que `IngresoVariable` — ninguno lleva
    // deny-all. Agregarlo acá "por si acaso" rompería el gate de Alex.
    for (const tabla of [
      "CostoRecurrente",
      "GastoPuntual",
      "CostoMovimiento",
      "TarjetaCredito",
      "TarjetaCreditoCosto",
      "PagoPlanilla",
      "ReglaComisionVendedor",
      "ComisionVendedor",
    ]) {
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
// ESCANEO, no lista hardcodeada: antes eran dos paths literales y una hoja nueva
// de costos nacía sin vigilancia. Ahora TODA página bajo app/(shell)/finanzas/**
// está obligada a gatear con isCostosRole antes de cargar nada, salvo las que se
// declaren explícitamente como NO-costos en la allowlist de abajo — agregar una
// pasa a ser una decisión visible en el diff, no un olvido.
describe("P4 · las páginas de Finanzas gatean ANTES de cargar datos", () => {
  const raiz = process.cwd();
  const baseFinanzas = path.join(raiz, "app", "(shell)", "finanzas");

  /**
   * Rutas de Finanzas que NO son de costos y por lo tanto NO llevan isCostosRole
   * (su gate es `cobranza.read`, la superficie de ADMIN). Clave = ruta relativa a
   * app/(shell)/finanzas.
   */
  const NO_COSTOS: Record<string, string> = {
    "ingresos-variables":
      "son INGRESOS (cobros ya registrados), no costos: su gate es cobranza.read, la superficie de ADMIN",
  };

  /**
   * Blanquea comentarios y literales de string CONSERVANDO los offsets (mismo
   * largo, mismos saltos de línea) para que los índices sigan siendo comparables.
   *
   * ⚠ POR QUÉ EXISTE: sin esto el escaneo se satisfacía con el COMENTARIO de
   * cabecera. Las 3 hojas de categoría mencionan «isCostosRole(role)» en su
   * docstring, así que `includes` daba true y `indexOf` apuntaba a la línea 3 —
   * o sea que una página que MENCIONA el gate sin invocarlo pasaba verde, y el
   * orden gate-antes-de-load quedaba medido contra el comentario. Se verificó
   * borrando el guard real de una copia: el test seguía en verde.
   * Es exactamente lo que el header de este archivo advierte: un comentario no
   * frena nada; lo que frena es el test — pero solo si mira el CÓDIGO.
   */
  function soloCodigo(src: string): string {
    const out = src.split("");
    const blanquear = (desde: number, hasta: number) => {
      for (let k = desde; k < hasta && k < out.length; k++) {
        if (out[k] !== "\n") out[k] = " ";
      }
    };
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      const d = src[i + 1];
      if (c === "/" && d === "/") {
        const fin = src.indexOf("\n", i);
        blanquear(i, fin === -1 ? src.length : fin);
        i = fin === -1 ? src.length : fin;
      } else if (c === "/" && d === "*") {
        const fin = src.indexOf("*/", i + 2);
        const hasta = fin === -1 ? src.length : fin + 2;
        blanquear(i, hasta);
        i = hasta;
      } else if (c === '"' || c === "'" || c === "`") {
        // Un string puede contener "isCostosRole(" y mentir igual que un comentario.
        let j = i + 1;
        while (j < src.length && src[j] !== c) {
          if (src[j] === "\\") j++;
          j++;
        }
        blanquear(i + 1, j);
        i = j + 1;
      } else {
        i++;
      }
    }
    return out.join("");
  }

  it("el escaneo mira el CÓDIGO, no los comentarios (meta-guard)", () => {
    const mentiroso = [
      "/** Gate AUTÓNOMO isCostosRole(role) — solo dirección. */",
      'const nota = "isCostosRole(ctx.role)";',
      "export default async function P() {",
      "  const costos = await loadCostos();",
      "}",
    ].join("\n");
    // Ni el comentario ni el string deben contar como invocación.
    expect(soloCodigo(mentiroso).includes("isCostosRole(")).toBe(false);
    // Y el código real sí sobrevive al blanqueo.
    expect(soloCodigo("if (!isCostosRole(ctx.role)) redirect();").includes("isCostosRole(")).toBe(
      true,
    );
  });

  function paginasDeFinanzas(dir: string, rel = ""): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) out.push(...paginasDeFinanzas(path.join(dir, e.name), r));
      else if (e.name === "page.tsx") out.push(rel);
    }
    return out;
  }

  const rutas = paginasDeFinanzas(baseFinanzas);

  it("el escaneo encuentra las páginas de Finanzas (guard del propio test)", () => {
    // Si alguien mueve o borra la carpeta, el test avisa en vez de pasar vacío.
    expect(rutas.length, "no se encontró ninguna page.tsx bajo finanzas/").toBeGreaterThanOrEqual(5);
    expect(rutas).toContain("costos");
    expect(rutas).toContain("caja-neta");
  });

  for (const rel of rutas) {
    const esDeCostos = !(rel in NO_COSTOS);
    if (!esDeCostos) continue;

    it(`finanzas/${rel}: isCostosRole corta antes de cualquier load*`, () => {
      const abs = path.join(baseFinanzas, rel, "page.tsx");
      // Comentarios y strings blanqueados: mencionar el gate no es invocarlo.
      const src = soloCodigo(fs.readFileSync(abs, "utf8"));
      expect(src.includes("isCostosRole("), `finanzas/${rel} no invoca isCostosRole`).toBe(true);

      const idxGate = src.indexOf("isCostosRole(");
      // `load[A-Z]…` cubre los futuros (loadTarjetas, loadMovimientosCostos…);
      // exige mayúscula para no matchear `loading`.
      const llamadasLoad = [...src.matchAll(/\bload[A-Z]\w*\(/g)];
      expect(llamadasLoad.length, `finanzas/${rel} no llama a ningún load*`).toBeGreaterThan(0);
      for (const m of llamadasLoad) {
        expect(
          m.index! > idxGate,
          `finanzas/${rel} — ${m[0]} aparece ANTES del gate isCostosRole`,
        ).toBe(true);
      }
    });
  }
});
