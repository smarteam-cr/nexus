/**
 * components/layout/nav-config.tsx — TOPOLOGÍA DECLARATIVA del sidebar.
 *
 * Antes el rail eran ~500 líneas de JSX imperativo: agregar un módulo = pegar un
 * <NavItem> + un <svg> a mano + una variable canSeeX. Ahora un módulo nuevo es UNA
 * entrada en APP_NAV (mismo salto que dio el registry de permisos). Generaliza el
 * patrón que ya existía en components/marketing/nav-config.ts.
 *
 * Los GATES son cosméticos (el sidebar solo esconde): la seguridad real vive en
 * cada página y endpoint. `canSeeNavItem` es PURO — el test de gates congelados
 * (lib/ui/nav-gates.test.ts) verifica que produce EXACTAMENTE los mismos ítems
 * que los booleanos del Sidebar viejo: la migración no puede cambiar quién ve
 * qué sin que un test lo diga.
 *
 * `group` divide el rail en dos zonas: "operacion" (los procesos del negocio) y
 * "administracion" (la configuración del sistema) — la jerarquía que faltaba
 * para que sumar procesos no produzca una tira ilegible de 17 ítems.
 */
import type { PermissionMap } from "@/lib/auth/permissions/types";
import { MARKETING_NAV_GROUPS } from "@/components/marketing/nav-config";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type NavGate =
  | { kind: "always" }
  | { kind: "permission"; section: string; action: string }
  | { kind: "superAdmin" };

export interface NavChildConfig {
  href: string;
  label: string;
  /** Prefijos extra que marcan el hijo como activo (default: [href]). */
  match?: readonly string[];
  /** Hijo visible solo para roles de Costos (whitelist COSTOS_ROLES). */
  costosOnly?: boolean;
}

export interface NavItemConfig {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Prefijos de ruta que marcan el ítem activo (default: [href]). */
  match?: readonly string[];
  /** Default: { kind: "always" }. */
  gate?: NavGate;
  /** Presencia ⇒ el ítem abre un flyout con estos hijos. */
  children?: readonly NavChildConfig[];
  /** Hijos cargados por fetch (el flyout de Roles lista los perfiles). */
  dynamicChildren?: "roles";
  group: "operacion" | "administracion";
}

export interface NavContext {
  isSuperAdmin: boolean;
  permissions: PermissionMap;
}

/** Espeja 1:1 los booleanos canSeeX del Sidebar pre-migración. PURO y testeable. */
export function canSeeNavItem(item: Pick<NavItemConfig, "gate">, ctx: NavContext): boolean {
  const gate = item.gate ?? { kind: "always" as const };
  if (gate.kind === "always") return true;
  if (gate.kind === "superAdmin") return ctx.isSuperAdmin;
  const sections = (ctx.permissions?.sections ?? {}) as Record<
    string,
    Record<string, boolean> | undefined
  >;
  return sections[gate.section]?.[gate.action] === true;
}

// ── Íconos (los mismos SVG del rail de siempre — cero cambio visual) ───────────

const icon = (d: string) => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

// ── El rail ────────────────────────────────────────────────────────────────────

export const APP_NAV: readonly NavItemConfig[] = [
  {
    key: "clients",
    label: "Clientes",
    href: "/clients",
    group: "operacion",
    icon: icon(
      "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    ),
  },
  {
    // Marketing: universal — todo rol interno VE (submenú con los 3 grupos;
    // editan MARKETING/CSL/SUPER_ADMIN — gate en API/páginas).
    key: "marketing",
    label: "Marketing",
    href: "/marketing",
    match: ["/marketing", "/contenido"],
    group: "operacion",
    children: MARKETING_NAV_GROUPS.map((g) => ({
      href: g.href,
      label: g.label,
      match: [g.href, ...g.children.map((c) => c.href)],
    })),
    icon: icon(
      "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
    ),
  },
  {
    key: "customer-success",
    label: "Éxito del cliente",
    href: "/customer-success",
    gate: { kind: "permission", section: "clientes", action: "viewAll" },
    group: "operacion",
    icon: icon(
      "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    ),
  },
  {
    key: "sales",
    label: "Ventas",
    href: "/business-cases",
    gate: { kind: "permission", section: "ventas", action: "read" },
    group: "operacion",
    icon: icon("M3 3v18h18M7 14l4-4 3 3 5-6"),
  },
  {
    // Finanzas: agrupa Cobranza · Costos y gastos · Caja neta. Los últimos 2
    // hijos son costosOnly (whitelist COSTOS_ROLES, se filtra al montar).
    key: "finanzas",
    label: "Finanzas",
    href: "/cobranza",
    match: ["/cobranza", "/finanzas"],
    gate: { kind: "permission", section: "cobranza", action: "read" },
    group: "operacion",
    children: [
      { href: "/cobranza", label: "Cobranza" },
      { href: "/finanzas/costos", label: "Costos y gastos", costosOnly: true },
      { href: "/finanzas/caja-neta", label: "Caja neta", costosOnly: true },
    ],
    icon: icon(
      "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
    ),
  },
  {
    key: "audits",
    label: "Auditoría",
    href: "/audits",
    gate: { kind: "permission", section: "auditoria", action: "read" },
    group: "operacion",
    icon: icon(
      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    ),
  },
  {
    key: "sessions",
    label: "Sesiones",
    href: "/sessions",
    group: "operacion",
    icon: icon(
      "M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
    ),
  },
  {
    key: "knowledge",
    label: "Conocimientos",
    href: "/knowledge",
    group: "operacion",
    icon: icon(
      "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    ),
  },
  {
    key: "agents",
    label: "Agentes",
    href: "/agents",
    gate: { kind: "permission", section: "agentes", action: "read" },
    group: "administracion",
    icon: icon(
      "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
    ),
  },
  {
    key: "team",
    label: "Equipo",
    href: "/team",
    gate: { kind: "superAdmin" },
    group: "administracion",
    icon: icon(
      "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    ),
  },
  {
    key: "roles",
    label: "Roles",
    href: "/roles",
    gate: { kind: "superAdmin" },
    group: "administracion",
    dynamicChildren: "roles",
    icon: icon(
      "M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 012-2h0a2 2 0 012 2v1m-4 0h4m-5 6a2 2 0 104 0 2 2 0 00-4 0zm5.5 5.5a3.5 3.5 0 00-7 0",
    ),
  },
  {
    key: "config",
    label: "Configuración",
    href: "/integrations",
    gate: { kind: "permission", section: "configuracion", action: "read" },
    group: "administracion",
    icon: icon(
      "M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z",
    ),
  },
];
