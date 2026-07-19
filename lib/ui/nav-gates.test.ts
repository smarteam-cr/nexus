/**
 * lib/ui/nav-gates.test.ts — GATES DEL SIDEBAR CONGELADOS.
 *
 * La migración a nav-config declarativo (APP_NAV + canSeeNavItem) no puede
 * cambiar QUIÉN VE QUÉ sin que este test lo diga: para cada combinación
 * representativa de rol×permisos, el filtro produce EXACTAMENTE los ítems que
 * los booleanos del Sidebar pre-migración producían (canSeeAgents = agentes.read,
 * canSeePortfolio = clientes.viewAll, canSeeSales = ventas.read, canSeeCobranza =
 * cobranza.read, canSeeAudits = auditoria.read, canSeeTeam/Roles = SUPER_ADMIN
 * duro, canSeeConfig = configuracion.read; Clientes/Marketing/Sesiones/
 * Conocimientos universales). Mismo criterio que el test de DEFAULT_MATRIX:
 * el mapa de visibilidad es un contrato, no un detalle de implementación.
 */
import { describe, expect, it } from "vitest";
import { APP_NAV, canSeeNavItem, type NavContext } from "@/components/layout/nav-config";
import type { PermissionMap } from "@/lib/auth/permissions/types";

function ctx(
  isSuperAdmin: boolean,
  sections: Record<string, Record<string, boolean>>,
): NavContext {
  return { isSuperAdmin, permissions: { sections } as unknown as PermissionMap };
}

const visibles = (c: NavContext) =>
  APP_NAV.filter((it) => canSeeNavItem(it, c)).map((it) => it.key);

const UNIVERSALES = ["clients", "marketing", "sessions", "knowledge"];

describe("gates del sidebar congelados (espejo de los booleanos pre-migración)", () => {
  it("SUPER_ADMIN ve los 12 ítems", () => {
    const c = ctx(true, {
      clientes: { viewAll: true },
      ventas: { read: true },
      cobranza: { read: true },
      auditoria: { read: true },
      agentes: { read: true },
      configuracion: { read: true },
    });
    expect(visibles(c)).toEqual([
      "clients",
      "marketing",
      "customer-success",
      "sales",
      "finanzas",
      "audits",
      "sessions",
      "knowledge",
      "agents",
      "team",
      "roles",
      "config",
    ]);
  });

  it("CSE base (sin permisos extra) ve solo los universales", () => {
    const c = ctx(false, {});
    expect(visibles(c)).toEqual(UNIVERSALES);
  });

  it("un rol con viewAll+ventas+auditoria+config+agentes (perfil CSL) ve lo suyo, sin Finanzas ni admin duro", () => {
    const c = ctx(false, {
      clientes: { viewAll: true },
      ventas: { read: true },
      auditoria: { read: true },
      agentes: { read: true },
      configuracion: { read: true },
    });
    expect(visibles(c)).toEqual([
      "clients",
      "marketing",
      "customer-success",
      "sales",
      "audits",
      "sessions",
      "knowledge",
      "agents",
      "config",
    ]);
  });

  it("cobranza.read habilita Finanzas (perfil ADMIN) y nada más", () => {
    const c = ctx(false, { cobranza: { read: true } });
    expect(visibles(c)).toEqual(["clients", "marketing", "finanzas", "sessions", "knowledge"]);
  });

  it("Equipo y Roles son gate DURO de SUPER_ADMIN: ningún permiso los enciende", () => {
    const c = ctx(false, {
      clientes: { viewAll: true },
      ventas: { read: true },
      cobranza: { read: true },
      auditoria: { read: true },
      agentes: { read: true },
      configuracion: { read: true },
    });
    const v = visibles(c);
    expect(v).not.toContain("team");
    expect(v).not.toContain("roles");
  });

  it("un permiso con valor false NO abre el gate (solo true explícito)", () => {
    const c = ctx(false, { ventas: { read: false }, agentes: {} });
    expect(visibles(c)).toEqual(UNIVERSALES);
  });
});
