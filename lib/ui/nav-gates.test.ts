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
  // Default `false` a propósito: los casos congelados de arriba NO se editan al sumar
  // este eje — siguen probando exactamente lo mismo que probaban.
  hasSharedDocs = false,
): NavContext {
  return { isSuperAdmin, permissions: { sections } as unknown as PermissionMap, hasSharedDocs };
}

const visibles = (c: NavContext) =>
  APP_NAV.filter((it) => canSeeNavItem(it, c)).map((it) => it.key);

/* Los que ve TODO rol interno. `documentacion` se sumó el 2026-08-02: explicar la herramienta
   no es un privilegio, y un manual que solo ven algunos no cumple su función.
   ⚠ El orden importa: `visibles()` respeta el orden de APP_NAV. */
const UNIVERSALES = ["clients", "marketing", "sessions", "knowledge", "documentacion"];

describe("gates del sidebar congelados (espejo de los booleanos pre-migración)", () => {
  it("SUPER_ADMIN ve los 13 ítems", () => {
    const c = ctx(true, {
      clientes: { viewAll: true },
      customerSuccess: { read: true },
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
      "documentacion",
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
      customerSuccess: { read: true },
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
      "documentacion",
      "agents",
      "config",
    ]);
  });

  it("⭐ un CSE con `customerSuccess.read` ve SU pantalla — y sigue sin ver la cartera", () => {
    /* El cambio del 2026-08-16: hasta entonces «Éxito del cliente» colgaba de `clientes.viewAll`,
       así que el rol que HACE éxito del cliente era el único operativo que no entraba, mientras
       Ventas, Desarrollo y Marketing sí — al revés de lo que hace falta.
       ⚠ Lo que este caso congela no es solo que aparezca: es que aparezca SIN `clientes.viewAll`.
       Si alguien "arreglara" esto volviendo a atar las dos cosas, el CSE pasaría a ver la cartera
       entera de la empresa y acá se vería. */
    const c = ctx(false, { customerSuccess: { read: true } });
    expect(visibles(c)).toEqual([
      "clients",
      "marketing",
      "customer-success",
      "sessions",
      "knowledge",
      "documentacion",
    ]);
  });

  it("cobranza.read habilita Finanzas (perfil ADMIN) y nada más", () => {
    const c = ctx(false, { cobranza: { read: true } });
    expect(visibles(c)).toEqual([
      "clients",
      "marketing",
      "finanzas",
      "sessions",
      "knowledge",
      "documentacion",
    ]);
  });

  it("Equipo es gate DURO de SUPER_ADMIN: ningún permiso lo enciende", () => {
    const c = ctx(false, {
      clientes: { viewAll: true },
      ventas: { read: true },
      cobranza: { read: true },
      auditoria: { read: true },
      agentes: { read: true },
      configuracion: { read: true },
    });
    expect(visibles(c)).not.toContain("team");
  });

  // ── Roles: dejó de ser gate duro cuando los documentos se pudieron COMPARTIR ──
  // Administrarlos sigue siendo de dirección; lo que abre el ítem para el resto no es un
  // permiso sino un HECHO: que le hayan compartido algo. Si el ítem no se encendiera, un
  // documento compartido sería inalcanzable y compartir no serviría de nada.
  it("Roles NO se enciende con permisos: hace falta tener algo compartido", () => {
    const c = ctx(false, {
      clientes: { viewAll: true },
      ventas: { read: true },
      cobranza: { read: true },
      auditoria: { read: true },
      agentes: { read: true },
      configuracion: { read: true },
    });
    expect(visibles(c)).not.toContain("roles");
  });

  it("con un documento compartido, Roles aparece — y Equipo NO", () => {
    const c = ctx(false, {}, true);
    const v = visibles(c);
    expect(v).toContain("roles");
    expect(v).not.toContain("team");
  });

  it("sin ningún permiso, un compartido ve los universales + Roles", () => {
    expect(visibles(ctx(false, {}, true))).toEqual([...UNIVERSALES, "roles"]);
  });

  it("un permiso con valor false NO abre el gate (solo true explícito)", () => {
    const c = ctx(false, { ventas: { read: false }, agentes: {} });
    expect(visibles(c)).toEqual(UNIVERSALES);
  });
});
