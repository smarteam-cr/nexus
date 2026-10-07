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
import { APP_NAV, canSeeNavItem, visibleNavChildren, type NavContext } from "@/components/layout/nav-config";
import { DEFAULT_MATRIX } from "@/lib/auth/permissions/defaults";
import type { PermissionMap } from "@/lib/auth/permissions/types";

function ctx(
  isSuperAdmin: boolean,
  sections: Record<string, Record<string, boolean>>,
  // Default `false` a propósito: los casos congelados de arriba NO se editan al sumar
  // este eje — siguen probando exactamente lo mismo que probaban.
  hasSharedDocs = false,
  // Mismo criterio: sin rol, los casos de arriba siguen probando lo mismo. Hace falta para los
  // ítems con gate por ROL (Éxito del cliente, desde el 2026-10-04).
  role: string | null = null,
): NavContext {
  return { isSuperAdmin, permissions: { sections } as unknown as PermissionMap, hasSharedDocs, role };
}

const visibles = (c: NavContext) =>
  APP_NAV.filter((it) => canSeeNavItem(it, c)).map((it) => it.key);

/* Los que ve TODO rol interno. `documentacion` se sumó el 2026-08-02: explicar la herramienta
   no es un privilegio, y un manual que solo ven algunos no cumple su función. `escala` se sumó el
   2026-09-27 por la misma razón: la escala la interioriza todo el equipo. `para-ti` (2026-10-04) muestra a cada
   persona lo suyo: no hay rol que no tenga algo que le toque.
   ⚠ El orden importa: `visibles()` respeta el orden de APP_NAV. */
const UNIVERSALES = ["para-ti", "clients", "marketing", "sessions", "knowledge", "documentacion", "escala"];

describe("gates del sidebar congelados (espejo de los booleanos pre-migración)", () => {
  it("SUPER_ADMIN ve los 16 ítems", () => {
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
      "para-ti",
      "clients",
      "marketing",
      "customer-success",
      "sales",
      "finanzas",
      "audits",
      "sessions",
      "knowledge",
      "documentacion",
      "escala",
      "agents",
      "team",
      "roles",
      // La bandeja de feedback (2026-10-04): revisar es de dirección; reportar lo hace todo el equipo.
      "feedback",
      "config",
    ]);
  });

  it("CSE base (sin permisos extra) ve solo los universales", () => {
    const c = ctx(false, {});
    expect(visibles(c)).toEqual(UNIVERSALES);
  });

  it("un rol con viewAll+ventas+auditoria+config+agentes (perfil CSL) ve lo suyo, sin Finanzas ni admin duro", () => {
    const c = ctx(
      false,
      {
        clientes: { viewAll: true },
        customerSuccess: { read: true },
        ventas: { read: true },
        auditoria: { read: true },
        agentes: { read: true },
        configuracion: { read: true },
      },
      false,
      "CSL",
    );
    expect(visibles(c)).toEqual([
      "para-ti",
      "clients",
      "marketing",
      "customer-success",
      "sales",
      "audits",
      "sessions",
      "knowledge",
      "documentacion",
      "escala",
      "agents",
      "config",
    ]);
  });

  it("⭐ Éxito del cliente es por ROL: CSL y dirección, ningún permiso lo enciende", () => {
    /* Desde el 2026-10-04 la pantalla muestra la cartera entera en dinero (MRR, comisión, puntos
       de partner) y es de la líder de Customer Success y de dirección. Hasta entonces colgaba de
       la celda `customerSuccess.read` y el CSE entraba a ver sus cuentas.
       ⚠ Lo que este caso congela es que NINGUNA combinación de permisos la abra: ni la celda
       vieja ni «ver todos los clientes». Volver a colgarla de una celda la delegaría por
       plantilla. */
    const todo = {
      clientes: { viewAll: true },
      customerSuccess: { read: true },
      ventas: { read: true },
      cobranza: { read: true },
      auditoria: { read: true },
      agentes: { read: true },
      configuracion: { read: true },
    };
    for (const rol of ["CSE", "VENTAS", "DEV", "MARKETING", "ADMIN", null]) {
      expect(visibles(ctx(false, todo, false, rol)), `${rol} ve Éxito del cliente`).not.toContain(
        "customer-success",
      );
    }
    expect(visibles(ctx(false, {}, false, "CSL"))).toEqual([
      "para-ti",
      "clients",
      "marketing",
      "customer-success",
      "sessions",
      "knowledge",
      "documentacion",
      "escala",
    ]);
  });

  it("cobranza.read habilita Finanzas (perfil ADMIN) y nada más", () => {
    const c = ctx(false, { cobranza: { read: true } });
    expect(visibles(c)).toEqual([
      "para-ti",
      "clients",
      "marketing",
      "finanzas",
      "sessions",
      "knowledge",
      "documentacion",
      "escala",
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

  it("⭐ todo Customer Success entra a Preventa, y de Ventas solo ve ese hijo (Elías, 2026-10-06)", () => {
    const ventas = APP_NAV.find((it) => it.key === "sales")!;
    const hijos = (permissions: PermissionMap) => visibleNavChildren(ventas, { isCostos: false, permissions }).map((c) => c.href);
    for (const rol of ["CSE", "CSL"] as const) {
      const permissions = DEFAULT_MATRIX[rol];
      expect(canSeeNavItem(ventas, { isSuperAdmin: false, permissions, role: rol }), rol).toBe(true);
    }
    expect(hijos(DEFAULT_MATRIX.CSE)).toEqual(["/sales/exploraciones"]);
    expect(hijos(DEFAULT_MATRIX.VENTAS)).toEqual(["/sales/exploraciones", "/business-cases", "/sales/use-cases", "/sales/sicop"]);
    expect(ventas.entradaEsHijo, "un CSE que hace clic en Ventas no puede caer en Propuestas").toBe(true);
  });
});
