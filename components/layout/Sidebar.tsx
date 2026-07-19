"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/lib/theme";
import { Menu } from "@/components/ui";
import RunsIndicator from "@/components/ai/RunsIndicator";
import type { PermissionMap } from "@/lib/auth/permissions/types";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { APP_NAV, canSeeNavItem } from "./nav-config";
import NavFlyout, { RolesNavFlyout } from "./NavFlyout";

interface ClientSummary {
  id: string;
  name: string;
  company: string | null;
  hubspotAccount: { id: string; hubName: string | null } | null;
}

interface UserLite {
  email: string;
  name: string;
  role: string | null;
  isSuperAdmin: boolean;
  /** Mapa EFECTIVO sección×acción (resuelto en AppShell, server-side). */
  permissions: PermissionMap;
}

interface SidebarProps {
  clients: ClientSummary[];
  user: UserLite;
  onToggle?: () => void;
  isOpen?: boolean;
}

/**
 * Lleva la vista "hasta arriba" del sitio. Cubre tanto el scroll de `window`
 * como los contenedores internos con overflow (ej. el canvas del cliente,
 * la lista de sesiones) — scrollea cualquier elemento que esté desplazado.
 */
function scrollSiteToTop() {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, behavior: "smooth" });
  document
    .querySelectorAll<HTMLElement>("div, main, section, article, aside")
    .forEach((el) => {
      if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior: "smooth" });
    });
}

// ── Ítem de navegación principal ─────────────────────────────────────────────
function NavItem({
  href,
  active,
  isOpen,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  isOpen: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      title={!isOpen ? label : undefined}
      className={`flex items-center rounded-lg text-sm transition-colors ${
        isOpen ? "gap-2.5 px-3 py-2" : "justify-center p-2.5"
      } ${
        active
          ? "bg-surface-hover text-fg"
          : "text-fg-muted hover:text-fg hover:bg-surface-muted"
      }`}
    >
      {icon}
      {isOpen && <span className="truncate">{label}</span>}
    </Link>
  );
}

// ── Avatar del usuario logueado + menú con "Cerrar sesión" ──────────────────
// (ex-CseSelector — el selector "Soy X" se eliminó en Fase E; ahora cada
// persona es ella misma vía Supabase Auth.)
function UserAvatar({ user, isOpen }: { user: UserLite; isOpen: boolean }) {
  // Estado de tema compartido (useTheme) → ícono/label correctos aunque el tema se haya
  // cambiado desde /settings, y el primer clic nunca es un no-op. La mecánica del
  // desplegable (fixed desde el trigger, click-afuera, scroll externo, teclado) vive
  // en la primitiva <Menu> — se extrajo de acá y no se reescribe nunca más.
  const { isDark, toggle: toggleTheme } = useTheme();

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || user.email[0]?.toUpperCase();

  const avatarBg = user.isSuperAdmin
    ? "bg-amber-600/20 text-amber-300 border-amber-700/40"
    : "bg-brand/20 text-brand border-brand/30";

  return (
    <Menu
      side="top"
      aria-label="Menú de usuario"
      triggerTitle={!isOpen ? user.name : undefined}
      triggerClassName={`w-full flex items-center gap-2 ${isOpen ? "px-2 py-1.5" : "p-1.5 justify-center"} rounded-lg hover:bg-surface-hover transition-colors text-left`}
      header={<p className="text-[11px] text-fg-muted truncate">{user.email}</p>}
      trigger={(open) => (
        <>
          <div className={`flex-shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-[10px] font-bold ${avatarBg}`}>
            {initials}
          </div>
          {isOpen && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-fg-secondary truncate">
                {user.name}
              </p>
              <p className="text-[10px] text-fg-muted truncate">
                {user.isSuperAdmin ? "Super Admin" : user.role ?? "Miembro"}
              </p>
            </div>
          )}
          {isOpen && (
            <svg className={`w-3 h-3 text-fg-muted transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </>
      )}
      items={[
        {
          key: "settings",
          label: "Configuración",
          href: "/settings",
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ),
        },
        {
          key: "theme",
          label: isDark ? "Modo claro" : "Modo oscuro",
          onSelect: toggleTheme,
          keepOpen: true,
          icon: isDark ? (
            // Sol → estás en oscuro, clic cambia a claro
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            // Luna → estás en claro, clic cambia a oscuro
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          ),
        },
        {
          key: "logout",
          label: "Cerrar sesión",
          formAction: "/auth/signout",
          danger: true,
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          ),
        },
      ]}
    />
  );
}

export default function Sidebar({ clients, user, onToggle, isOpen = true }: SidebarProps) {
  const pathname = usePathname();

  // Visibilidad de ítems desde el mapa de PERMISOS EFECTIVO, resuelta por los
  // gates DECLARATIVOS de nav-config (canSeeNavItem es puro; el test de gates
  // congelados en lib/ui/nav-gates.test.ts fija quién ve qué). Es cosmético:
  // la seguridad real vive en cada página/endpoint.
  const role = user.role ?? "";
  const isSuperAdmin = user.isSuperAdmin || role === "SUPER_ADMIN";
  const navCtx = { isSuperAdmin, permissions: user.permissions };

  return (
    <aside className="w-full bg-background border-r border-line flex flex-col sticky top-0 h-screen overflow-hidden">

      {/* ── Brand ── */}
      <div className={`h-14 border-b border-line flex-shrink-0 flex items-center ${isOpen ? "px-4 justify-between" : "justify-center"}`}>
        {isOpen ? (
          <>
            <Link
              href="/clients"
              onClick={scrollSiteToTop}
              className="flex items-center gap-2.5 min-w-0"
            >
              <BrandIcon />
              <span className="text-sm font-semibold text-fg leading-tight truncate">
                Nexus
              </span>
            </Link>
            {onToggle && (
              <button
                onClick={onToggle}
                title="Colapsar menú"
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-fg-muted hover:text-fg-secondary hover:bg-surface-hover transition-colors"
              >
                <ChevronLeft />
              </button>
            )}
          </>
        ) : (
          <button
            onClick={onToggle}
            title="Expandir menú"
            className="w-7 h-7 flex items-center justify-center rounded-md text-fg-muted hover:text-fg-secondary hover:bg-surface-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>


      {/* ── Nav principal: DECLARATIVO desde APP_NAV (nav-config), en dos zonas
          (operación / administración). No scrollea con la lista de clientes; en
          pantalla baja se encoge y scrollea SOLO él (min-h-0), nunca se recorta. ── */}
      <nav className={`py-3 overflow-y-auto min-h-0 ${isOpen ? "px-3" : "px-2"}`}>
        {(["operacion", "administracion"] as const).map((grupo) => {
          const items = APP_NAV.filter((it) => it.group === grupo && canSeeNavItem(it, navCtx));
          if (items.length === 0) return null;
          return (
            <div key={grupo}>
              {grupo === "administracion" && (
                <>
                  <div className={`my-2 border-t border-line/60 ${isOpen ? "mx-1" : "mx-0.5"}`} />
                  {isOpen && (
                    <p className="px-3 pb-1 text-2xs font-semibold text-fg-muted uppercase tracking-widest">
                      Administración
                    </p>
                  )}
                </>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  if (item.dynamicChildren === "roles") {
                    return <RolesNavFlyout key={item.key} item={item} isOpen={isOpen} />;
                  }
                  if (item.children) {
                    const children = item.children.filter((c) => !c.costosOnly || isCostosRole(role));
                    return <NavFlyout key={item.key} item={item} items={children} isOpen={isOpen} />;
                  }
                  return (
                    <NavItem
                      key={item.key}
                      href={item.href}
                      active={(item.match ?? [item.href]).some((p) => pathname.startsWith(p))}
                      isOpen={isOpen}
                      label={item.label}
                      icon={item.icon}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
          </nav>

        {/* ── Clientes recientes: ocupa el espacio restante y scrollea SOLO
            ella (ya no arrastra el menú ni queda comprimida en 150px fijos). ── */}
        {isOpen && clients.length > 0 && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="border-t border-gray-800/60 mx-3 mb-2 flex-shrink-0" />
            <p className="px-6 pb-1.5 text-2xs font-semibold text-gray-600 uppercase tracking-widest flex-shrink-0">
              Clientes recientes
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 space-y-0.5 pb-2">
              {clients.slice(0, 8).map((client) => {
                const isActive = pathname.startsWith(`/clients/${client.id}`);
                return (
                  <Link
                    key={client.id}
                    href={`/clients/${client.id}`}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                      isActive ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-900"
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${client.hubspotAccount ? "bg-green-400" : "bg-gray-600"}`} />
                    <div className="min-w-0">
                      <p className="text-xs truncate">{client.name}</p>
                      {client.hubspotAccount?.hubName ? (
                        <p className="text-2xs text-green-600 truncate">{client.hubspotAccount.hubName}</p>
                      ) : client.company ? (
                        <p className="text-2xs text-gray-600 truncate">{client.company}</p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
              {clients.length > 8 && (
                <Link href="/clients" className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors">
                  +{clients.length - 8} más
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Si no hay clientes recientes (colapsado o lista vacía), un
            espaciador ocupa el hueco y empuja el avatar al fondo igual. */}
        {(!isOpen || clients.length === 0) && <div className="flex-1 min-h-0" />}

      {/* ── Avatar del usuario logueado (FIJO al fondo, siempre visible; con
              dropdown hacia arriba que incluye Configuración + Cerrar sesión). ── */}
      <div className="flex-shrink-0 border-t border-gray-800/60 py-2">
        <div className={isOpen ? "px-2" : "px-1"}>
          <RunsIndicator isOpen={isOpen} />
          <UserAvatar user={user} isOpen={isOpen} />
        </div>
      </div>
    </aside>
  );
}

// ── Íconos reutilizables ──────────────────────────────────────────────────────
function BrandIcon() {
  return (
    <div className="w-7 h-7 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
      <svg className="w-3.5 h-3.5 text-brand-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="2.5"/>
        <circle cx="19" cy="12" r="1.5"/>
        <circle cx="15.5" cy="18.1" r="1.5"/>
        <circle cx="8.5" cy="18.1" r="1.5"/>
        <circle cx="5" cy="12" r="1.5"/>
        <circle cx="8.5" cy="5.9" r="1.5"/>
        <circle cx="15.5" cy="5.9" r="1.5"/>
        <line x1="14.5" y1="12" x2="17.5" y2="12"/>
        <line x1="13.25" y1="14.17" x2="14.75" y2="16.76"/>
        <line x1="10.75" y1="14.17" x2="9.25" y2="16.76"/>
        <line x1="9.5" y1="12" x2="6.5" y2="12"/>
        <line x1="10.75" y1="9.83" x2="9.25" y2="7.24"/>
        <line x1="13.25" y1="9.83" x2="14.75" y2="7.24"/>
      </svg>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
    </svg>
  );
}
