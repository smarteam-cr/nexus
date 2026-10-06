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
import type { VistaFinanzas } from "@/lib/finanzas/vista";
import { MARKETING_NAV } from "@/components/marketing/nav-config";
import { ROLES_DE_EXITO_DEL_CLIENTE } from "@/lib/cs/acceso";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type NavGate =
  | { kind: "always" }
  | { kind: "permission"; section: string; action: string }
  | { kind: "superAdmin" }
  /** Dirección, MÁS quien tenga algún documento de Roles compartido (ver `hasSharedDocs`). */
  | { kind: "superAdminOrSharedDocs" }
  /**
   * Por ROL, fuera de la matriz (no se delega por plantilla): Éxito del cliente es de la CSL y de
   * dirección (2026-10-04, `lib/cs/acceso.ts`). SUPER_ADMIN pasa siempre.
   */
  | { kind: "roles"; roles: readonly string[] };

export interface NavChildConfig {
  href: string;
  label: string;
  /** Prefijos extra que marcan el hijo como activo (default: [href]). */
  match?: readonly string[];
  /** Hijo visible solo para roles de Costos (whitelist COSTOS_ROLES). */
  costosOnly?: boolean;
  /**
   * Las vistas de Finanzas que lo tienen en el panel (2026-10-03, lib/finanzas/vista.ts). Ausente = todas. Decide solo
   * el MENÚ: la seguridad sigue en cada página.
   */
  vistas?: readonly VistaFinanzas[];
  /** Además de lo anterior, el hijo pide este permiso (p. ej. `gastos.read` para lo de gastos sin salarios). */
  permiso?: { section: string; action: string };
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
  /** Lleva un número al lado (lo que pide atención hoy). Solo «Para ti» (components/para-ti/cuenta.ts). */
  cuenta?: "para-ti";
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
  /** El rol de la persona (`TeamRole`), para los gates por rol. */
  role?: string | null;
}

/** Espeja 1:1 los booleanos canSeeX del Sidebar pre-migración. PURO y testeable. */
export function canSeeNavItem(item: Pick<NavItemConfig, "gate">, ctx: NavContext): boolean {
  const gate = item.gate ?? { kind: "always" as const };
  if (gate.kind === "always") return true;
  if (gate.kind === "superAdmin") return ctx.isSuperAdmin;
  // Roles: dirección lo administra; el resto entra solo si le compartieron algo.
  if (gate.kind === "superAdminOrSharedDocs") return ctx.isSuperAdmin || ctx.hasSharedDocs === true;
  if (gate.kind === "roles") return ctx.isSuperAdmin || (!!ctx.role && gate.roles.includes(ctx.role));
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

/**
 * Espeja el filtro del Sidebar: un hijo `costosOnly` solo lo ve un rol de Costos; uno con `vistas`, solo quien tiene una
 * de esas vistas de Finanzas; uno con `permiso`, solo quien lo tiene. Sin `vista` en el contexto no se filtra por vista
 * (los flyouts que no son de Finanzas no la usan).
 */
export function visibleNavChildren(
  item: Pick<NavItemConfig, "children">,
  ctx: { isCostos: boolean; vista?: VistaFinanzas; permissions?: PermissionMap },
): NavChildConfig[] {
  const sections = (ctx.permissions?.sections ?? {}) as Record<string, Record<string, boolean> | undefined>;
  return (item.children ?? []).filter(
    (c) =>
      (!c.costosOnly || ctx.isCostos) &&
      (!c.vistas || !ctx.vista || c.vistas.includes(ctx.vista)) &&
      (!c.permiso || ctx.isCostos || sections[c.permiso.section]?.[c.permiso.action] === true),
  );
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
    // Para ti (2026-10-04): lo que le toca a cada persona, de todos los módulos. Universal: no muestra nada que la
    // persona no pueda abrir. Primero del menú porque es por donde se empieza el día.
    key: "para-ti",
    label: "Para ti",
    href: "/para-ti",
    group: "operacion",
    cuenta: "para-ti",
    icon: icon(
      "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4",
    ),
  },
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
    // Marketing: universal — todo rol interno VE (submenú en dos bloques más Generación;
    // editan MARKETING/CSL/SUPER_ADMIN — gate en API/páginas).
    key: "marketing",
    label: "Marketing",
    href: "/marketing",
    match: ["/marketing", "/contenido"],
    group: "operacion",
    children: MARKETING_NAV.map((c) => ({
      href: c.href,
      label: c.label,
      match: c.match ?? [c.href],
      section: c.section,
    })),
    icon: icon(
      "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
    ),
  },
  {
    key: "customer-success",
    label: "Éxito del cliente",
    href: "/customer-success",
    // De la CSL y dirección, por rol (2026-10-04, lib/cs/acceso.ts): el índice muestra la cartera
    // entera en dinero. Hasta entonces colgaba de la celda `customerSuccess.read` (el CSE entraba).
    gate: { kind: "roles", roles: ROLES_DE_EXITO_DEL_CLIENTE },
    group: "operacion",
    icon: icon(
      "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    ),
  },
  {
    key: "sales",
    label: "Ventas",
    href: "/business-cases",
    // `match` extendido a /sales: el área tiene más de una pantalla desde que existe
    // SICOP, y sin esto el rail se apagaría al entrar ahí (y el crumb de módulo, que
    // sale de este mismo `match`, no diría "Ventas").
    match: ["/business-cases", "/sales"],
    gate: { kind: "permission", section: "ventas", action: "read" },
    group: "operacion",
    children: [
      // El lienzo de cada prospecto antes de la propuesta: prepara las dos reuniones, estima su
      // nivel en la escala y llega a la propuesta con metas en cifras. Va primero: es el orden
      // del proceso (se explora, después se propone).
      { href: "/sales/exploraciones", label: "Preventa" },
      { href: "/business-cases", label: "Propuestas" },
      // El CATÁLOGO de servicios pre-cotizados que el vendedor marca en el checklist de una
      // propuesta. Hasta hoy solo se llegaba por un link chiquito del encabezado de
      // /business-cases; es un área propia y va en el menú como tal.
      { href: "/sales/use-cases", label: "Casos de uso" },
      // Licitaciones públicas: viven como tickets del pipeline «Gobiernos» de HubSpot,
      // no como tratos. Una hoja se declara acá en la MISMA tanda que crea su ruta.
      { href: "/sales/sicop", label: "SICOP" },
    ],
    icon: icon("M3 3v18h18M7 14l4-4 3 3 5-6"),
  },
  {
    // Finanzas (rediseño 2026-10-03, docs/finanzas-rediseno-plan.md): UN ítem, pero el panel cambia según la VISTA de
    // quien entra (lib/finanzas/vista.ts) y «Finanzas» lleva a la pantalla de entrada de esa vista (/finanzas redirige).
    //   · REGISTRA (Dinia): Mi día · Ingresos · Costos y gastos sin salarios · Cuadre.
    //   · SUPERVISA (Alex): Mi área · Ingresos · Costos y gastos con planilla · Cuadre · Reportes.
    //   · DIRECCION: Reportes.
    // ⚠ La vista decide el menú, no la seguridad: cada página sigue con su guarda. `costosOnly` y `permiso` filtran
    // además, para que nadie vea en el menú algo que la página le va a negar.
    key: "finanzas",
    label: "Finanzas",
    href: "/finanzas",
    match: ["/cobranza", "/finanzas"],
    gate: { kind: "permission", section: "cobranza", action: "read" },
    group: "operacion",
    children: [
      // Una hoja se agrega acá en la MISMA tanda que crea su ruta: hasta que exista su page.tsx, el menú prometería
      // un 404.
      { href: "/finanzas/pendientes", label: "Pendientes", section: "Mi día", vistas: ["REGISTRA"] },
      // Lo de quien supervisa: decidir, revisar el trabajo del equipo y cerrar el mes.
      { href: "/finanzas/supervision", label: "Supervisión", section: "Mi área", costosOnly: true, vistas: ["SUPERVISA"] },
      { href: "/finanzas/cierre", label: "Cierre del mes", section: "Mi área", costosOnly: true, vistas: ["SUPERVISA"] },
      { href: "/cobranza", label: "Cobranza", section: "Ingresos", vistas: ["REGISTRA", "SUPERVISA"] },
      // Las de PARTNER son un ingreso y van en este bloque, visibles para ADMIN. Las de VENDEDOR son remuneración y
      // viven con la planilla, con otro gate: nunca se juntan.
      { href: "/finanzas/comisiones-partner", label: "Comisiones de aliados", section: "Ingresos", vistas: ["REGISTRA", "SUPERVISA"] },
      { href: "/finanzas/ingresos-variables", label: "Otros ingresos", section: "Ingresos", vistas: ["REGISTRA", "SUPERVISA"] },
      // Costos y gastos SIN salarios (permiso `gastos`, que ADMIN trae): lo que anota quien registra. Reemplazan a las
      // hojas Resumen · Herramientas · Costos fijos · Tarjetas de Costos, que siguen existiendo para Super Admin pero ya no
      // están en el menú.
      { href: "/finanzas/gastos", label: "Gastos del mes", section: "Costos y gastos", vistas: ["REGISTRA", "SUPERVISA"], permiso: { section: "gastos", action: "read" } },
      { href: "/finanzas/recurrentes", label: "Recurrentes", section: "Costos y gastos", vistas: ["REGISTRA", "SUPERVISA"], permiso: { section: "gastos", action: "read" } },
      { href: "/finanzas/tarjetas", label: "Tarjetas", section: "Costos y gastos", vistas: ["REGISTRA", "SUPERVISA"], permiso: { section: "gastos", action: "read" } },
      // ⚠ UNA sola entrada de planilla, solo para Super Admin. Abre en el CALENDARIO (2026-10-06, pedido de Alex: la tabla
      // donde ve las quincenas que faltan y las llena). Adentro conviven lo que cuesta por mes (`planillas`, «Salarios»), lo
      // que se pagó de verdad (`planillas/historial`, botón «Historial»), y desde ahí se llega al aguinaldo y a las
      // comisiones de vendedor, que viven con la planilla. Esas hojas hijas NO se declaran acá a propósito: si
      // estuvieran, el prefijo las marcaría activas dos veces y `nav-children.test` lo frena; con `match` queda
      // iluminada la planilla mientras se las mira.
      {
        href: "/finanzas/costos/planillas/calendario",
        label: "Planilla",
        section: "Costos y gastos",
        costosOnly: true,
        vistas: ["SUPERVISA"],
        match: ["/finanzas/costos/planillas", "/finanzas/costos/aguinaldo", "/finanzas/costos/comisiones-vendedor"],
      },
      // Lo que no cuadra con Odoo y Mercury, en una sola lista. Lo trabaja quien registra; quien supervisa decide lo que
      // es de negocio.
      { href: "/finanzas/conciliacion", label: "Conciliación", section: "Cuadre", vistas: ["REGISTRA", "SUPERVISA"] },
      // Los reportes: la síntesis de los dos lados (entra − sale). Son de dirección y de quien supervisa.
      { href: "/finanzas/equilibrio", label: "Punto de equilibrio", section: "Reportes", costosOnly: true, vistas: ["SUPERVISA", "DIRECCION"] },
      { href: "/finanzas/caja-neta", label: "Caja neta", section: "Reportes", costosOnly: true, vistas: ["SUPERVISA", "DIRECCION"] },
      // El margen de cada cuenta con sus horas reales y cuándo contratar (2026-10-06). Vive en Éxito del cliente porque
      // es de la CSL y de dirección; este acceso es el de dirección, que la busca entre los reportes.
      { href: "/customer-success/rentabilidad", label: "Rentabilidad", section: "Reportes", costosOnly: true, vistas: ["SUPERVISA", "DIRECCION"] },
      // El tipo de cambio del BCCR día por día (2026-10-05). Sin `costosOnly`: una tasa publicada no es sensible.
      { href: "/finanzas/tipo-de-cambio", label: "Tipo de cambio", section: "Reportes", vistas: ["SUPERVISA", "DIRECCION"] },
      { href: "/finanzas/integraciones", label: "Integraciones", section: "Reportes", costosOnly: true, vistas: ["SUPERVISA", "DIRECCION"] },
      // Proyección, reportes de cobranza y el corte quincenal: se mudaron de las pestañas de Cobranza.
      { href: "/finanzas/reportes", label: "Reportes de cobranza", section: "Reportes", costosOnly: true, vistas: ["SUPERVISA"] },
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
    // La Escala de Rendimiento, para leerla y comentarla (2026-09-27). SIN gate, como
    // Documentación: la usa todo el equipo para interiorizarla. Es de solo lectura; lo único que
    // se escribe son comentarios, y su estado lo cambia solo el responsable de la escala.
    key: "escala",
    label: "Escala",
    href: "/escala",
    group: "operacion",
    icon: icon("M3 20h5v-5h5v-5h5V5h3"),
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
    // Feedback (2026-10-04): la bandeja, la hoja de ruta y quién reporta. Reportar lo hace TODO el equipo
    // desde el pie del menú; revisar es de dirección (lib/feedback/reglas.ts › esRevisorDeFeedback).
    key: "feedback",
    label: "Feedback",
    href: "/feedback",
    gate: { kind: "superAdmin" },
    group: "administracion",
    icon: icon("M4 5h16v11H10l-6 4z M8 9h8 M8 12h5"),
  },
  {
    key: "config",
    /* Se llamaba «Configuración» y competía con el «Configuración» del menú del avatar, que lleva
       a otra pantalla. Dos entradas con el mismo nombre y distinto destino: la persona aprende que
       una de las dos no es la que busca, y prueba las dos cada vez. Acá vive lo que Nexus conecta
       con el mundo —HubSpot, Google, Claude, Odoo— así que se llama por lo que es.
       ⚠ La `key` NO cambia: `lib/ui/nav-gates.test.ts` congela las keys visibles por rol. */
    label: "Integraciones",
    href: "/integrations",
    gate: { kind: "permission", section: "configuracion", action: "read" },
    group: "administracion",
    icon: icon(
      "M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z",
    ),
  },
];
