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
  | { kind: "superAdmin" }
  /** Dirección, MÁS quien tenga algún documento de Roles compartido (ver `hasSharedDocs`). */
  | { kind: "superAdminOrSharedDocs" };

export interface NavChildConfig {
  href: string;
  label: string;
  /** Prefijos extra que marcan el hijo como activo (default: [href]). */
  match?: readonly string[];
  /** Hijo visible solo para roles de Costos (whitelist COSTOS_ROLES). */
  costosOnly?: boolean;
  /**
   * Activo por igualdad EXACTA en vez de prefijo. Lo necesita una hoja que es
   * PADRE de otras: sin esto, `/finanzas/costos` se marcaría activo también en
   * `/finanzas/costos/herramientas` y compañía.
   */
  exact?: boolean;
  /**
   * Encabezado del bloque al que PERTENECE este hijo — no "encabezado antes de
   * mí". La diferencia importa: el flyout agrupa DESPUÉS de filtrar, así que un
   * bloque cuyos hijos se filtran enteros (ej. los de costos para un ADMIN) no
   * deja un encabezado huérfano. Con la otra semántica habría que acordarse de
   * mover el encabezado al agregar un hijo arriba — edición a distancia que nada
   * fuerza. Sin `section` = hoja suelta (el flyout le pone un divisor).
   */
  section?: string;
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
  /**
   * ¿Tiene AL MENOS UN documento de Roles compartido? No es un permiso ni un rol: es un
   * HECHO de datos, y por eso no se puede derivar de `permissions`. Lo calcula AppShell.
   */
  hasSharedDocs?: boolean;
}

/** Espeja 1:1 los booleanos canSeeX del Sidebar pre-migración. PURO y testeable. */
export function canSeeNavItem(item: Pick<NavItemConfig, "gate">, ctx: NavContext): boolean {
  const gate = item.gate ?? { kind: "always" as const };
  if (gate.kind === "always") return true;
  if (gate.kind === "superAdmin") return ctx.isSuperAdmin;
  // Roles: dirección lo administra; el resto entra solo si le compartieron algo.
  if (gate.kind === "superAdminOrSharedDocs") return ctx.isSuperAdmin || ctx.hasSharedDocs === true;
  const sections = (ctx.permissions?.sections ?? {}) as Record<
    string,
    Record<string, boolean> | undefined
  >;
  return sections[gate.section]?.[gate.action] === true;
}

// ── Hijos del flyout: las 3 reglas, PURAS ──────────────────────────────────────
// Vivían inline en el JSX (el filtro en Sidebar.tsx, el activo en NavFlyout.tsx) y
// por eso no había forma de testear la visibilidad de un hijo — el único hueco que
// dejaba el test de gates congelados. Extraerlas es lo que permite que el test
// PRUEBE la regla en vez de duplicarla.

/** Espeja el filtro del Sidebar: un hijo `costosOnly` solo lo ve un rol de Costos. */
export function visibleNavChildren(
  item: Pick<NavItemConfig, "children">,
  ctx: { isCostos: boolean },
): NavChildConfig[] {
  return (item.children ?? []).filter((c) => !c.costosOnly || ctx.isCostos);
}

/**
 * Espeja el predicado de activo del flyout: `startsWith` por default, igualdad
 * EXACTA con `exact`. El parámetro se tipa suelto para aceptar también los ítems
 * que arma `RolesNavFlyout`, que no salen de la config.
 */
export function isChildActive(
  child: { href: string; match?: readonly string[]; exact?: boolean },
  pathname: string,
): boolean {
  return child.exact
    ? pathname === child.href
    : (child.match ?? [child.href]).some((p) => pathname.startsWith(p));
}

export interface NavChildBlock<T> {
  section?: string;
  items: T[];
}

/**
 * Agrupa hijos YA FILTRADOS en RUNS CONSECUTIVOS por `section` (no en un Map):
 * así el orden de la config ES el orden visual, y una hoja sin sección después de
 * un bloque queda como su propio run sin label. Si alguien escribiera A,B,A vería
 * dos bloques "A" — la señal correcta, en vez de un reordenamiento silencioso.
 */
export function groupNavChildren<T extends { section?: string }>(
  items: readonly T[],
): NavChildBlock<T>[] {
  const out: NavChildBlock<T>[] = [];
  for (const child of items) {
    const last = out[out.length - 1];
    if (last && last.section === child.section) last.items.push(child);
    else out.push({ section: child.section, items: [child] });
  }
  return out;
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
      // Una hoja se agrega acá en la MISMA tanda que crea su ruta: hasta que
      // exista su page.tsx, el menú prometería un 404.
      { href: "/cobranza", label: "Cobranza", section: "Ingresos" },
      { href: "/finanzas/ingresos-variables", label: "Ingresos variables", section: "Ingresos" },
      // Las de PARTNER son un ingreso y van en este bloque, visibles para ADMIN.
      // Las de VENDEDOR son remuneración y viven en "Costos y gastos" con otro gate.
      { href: "/finanzas/comisiones-partner", label: "Comisiones de partner", section: "Ingresos" },
      // `exact`: sin esto el Resumen se marcaría activo también en sus 3 hojas hijas.
      { href: "/finanzas/costos", label: "Resumen", section: "Costos y gastos", costosOnly: true, exact: true },
      { href: "/finanzas/costos/herramientas", label: "Herramientas", section: "Costos y gastos", costosOnly: true },
      // ⚠ Dos hojas con nombres parecidos, a propósito y con copy que las separa:
      // «Planillas» es el salario all-in ESTIMADO que alimenta el burn; «Libro de
      // planilla» es lo que salió de verdad, quincena por quincena.
      { href: "/finanzas/costos/planillas", label: "Planillas (estimado)", section: "Costos y gastos", costosOnly: true },
      { href: "/finanzas/costos/pagos-planilla", label: "Libro de planilla", section: "Costos y gastos", costosOnly: true },
      { href: "/finanzas/costos/aguinaldo", label: "Aguinaldo", section: "Costos y gastos", costosOnly: true },
      { href: "/finanzas/costos/fijos", label: "Costos fijos", section: "Costos y gastos", costosOnly: true },
      // ⚠ Va DENTRO del run "Costos y gastos" y ANTES de caja-neta: nav-children.test
      // exige que el ÚLTIMO bloque sea exactamente ["/finanzas/caja-neta"] sin section.
      { href: "/finanzas/costos/tarjetas", label: "Tarjetas", section: "Costos y gastos", costosOnly: true },
      // Sin `section`: la caja neta es la SÍNTESIS de los dos bloques (entra − sale),
      // no pertenece a ninguno. El flyout le deriva un divisor por ser un run suelto.
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
    // El manual de la app: cómo funciona, qué hace cada documento, cómo se conecta con HubSpot.
    // SIN gate a propósito — explicar la herramienta no es un privilegio, y una documentación
    // que solo ven algunos no cumple su función. Las pestañas son in-page (`?s=`), no hijos.
    key: "documentacion",
    label: "Documentación",
    href: "/documentacion",
    group: "operacion",
    icon: icon(
      "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
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
    // No es `superAdmin` a secas: un documento compartido tiene que ser ALCANZABLE, o el
    // compartir no sirve de nada. Administrarlo sigue siendo de dirección.
    gate: { kind: "superAdminOrSharedDocs" },
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
