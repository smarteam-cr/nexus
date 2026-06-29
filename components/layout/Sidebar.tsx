"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/lib/theme";

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
          ? "bg-gray-800 text-white"
          : "text-gray-400 hover:text-white hover:bg-gray-900"
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
  const [menuOpen, setMenuOpen] = useState(false);
  // Estado de tema compartido (useTheme) → ícono/label correctos aunque el tema se haya
  // cambiado desde /settings, y el primer clic nunca es un no-op. No hay hydration mismatch:
  // el botón del avatar no depende de `isDark` y el menú no se renderiza en SSR.
  const { isDark, toggle: toggleTheme } = useTheme();
  // Posición del menú (position:fixed) calculada desde el botón → escapa del
  // overflow-hidden del rail colapsado, que si no recortaba el desplegable.
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const computePos = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, bottom: window.innerHeight - r.top + 6 });
  };

  const toggleMenu = () => {
    if (!menuOpen) computePos();
    setMenuOpen((p) => !p);
  };

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onScroll(e: Event) {
      // No cerrar si el scroll ocurre DENTRO del menú (cuando es alto y scrollea por maxHeight);
      // el menú es descendiente DOM de `ref` aunque visualmente sea position:fixed.
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    window.addEventListener("resize", computePos);
    // El menú es position:fixed (coords congeladas al abrir); si el <nav> interno scrollea,
    // el botón se mueve y el menú quedaría desanclado → lo cerramos. `true` = fase de captura,
    // para atrapar también el scroll de contenedores internos, no solo el de window.
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("resize", computePos);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menuOpen]);

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
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        onClick={toggleMenu}
        className={`w-full flex items-center gap-2 ${isOpen ? "px-2 py-1.5" : "p-1.5 justify-center"} rounded-lg hover:bg-surface-hover transition-colors text-left`}
        title={!isOpen ? user.name : undefined}
      >
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
          <svg className={`w-3 h-3 text-fg-muted transition-transform flex-shrink-0 ${menuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {menuOpen && pos && (
        <div
          className="fixed z-50 w-56 bg-surface border border-line rounded-xl shadow-xl py-1.5 overflow-y-auto"
          style={{ left: pos.left, bottom: pos.bottom, maxHeight: "calc(100vh - 16px)" }}
        >
          <div className="px-3 py-2 border-b border-line">
            <p className="text-[11px] text-fg-muted truncate">{user.email}</p>
          </div>
          <Link
            href="/settings"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-xs text-fg-secondary hover:bg-surface-hover transition-colors"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configuración
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-fg-secondary hover:bg-surface-hover transition-colors"
          >
            {isDark ? (
              // Sol → estás en oscuro, clic cambia a claro
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              // Luna → estás en claro, clic cambia a oscuro
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
            {isDark ? "Modo claro" : "Modo oscuro"}
          </button>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-surface-hover transition-colors"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ clients, user, onToggle, isOpen = true }: SidebarProps) {
  const pathname = usePathname();

  // Visibilidad de ítems del menú por rol de permiso (roleEnum). Es cosmético:
  // la seguridad real vive en cada página/endpoint; esto solo evita mostrar
  // accesos que el rol no usa. Universales (todos): Clientes, ICP, Sesiones, Conocimientos.
  const role = user.role ?? "";
  const isSuperAdmin = user.isSuperAdmin || role === "SUPER_ADMIN";
  const canSeeAgents = isSuperAdmin || ["VENTAS", "CSL", "MARKETING"].includes(role); // todos menos CSE
  const canSeePortfolio = isSuperAdmin || ["VENTAS", "CSL", "MARKETING"].includes(role); // Cartera: seeAllClients (todos menos CSE)
  const canSeeSales = isSuperAdmin || ["VENTAS", "CSL"].includes(role);                  // Ventas: VENTAS/CSL/SUPER_ADMIN
  const canSeeAudits = isSuperAdmin || ["VENTAS", "CSL"].includes(role);              // super admin, CSL, ventas
  const canSeeTeam = isSuperAdmin;                                                     // solo super admin
  const canSeeConfig = isSuperAdmin || ["CSL", "MARKETING"].includes(role);            // super admin + CSL/Marketing

  return (
    <aside className="w-full bg-gray-950 border-r border-gray-800 flex flex-col min-h-screen sticky top-0 h-screen">

      {/* ── Brand ── */}
      <div className={`h-14 border-b border-gray-800 flex-shrink-0 flex items-center ${isOpen ? "px-4 justify-between" : "justify-center"}`}>
        {isOpen ? (
          <>
            <Link
              href="/clients"
              onClick={scrollSiteToTop}
              className="flex items-center gap-2.5 min-w-0"
            >
              <BrandIcon />
              <span className="text-sm font-semibold text-white leading-tight truncate">
                Nexus
              </span>
            </Link>
            {onToggle && (
              <button
                onClick={onToggle}
                title="Colapsar menú"
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
              >
                <ChevronLeft />
              </button>
            )}
          </>
        ) : (
          <button
            onClick={onToggle}
            title="Expandir menú"
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>


      {/* ── Nav principal ── */}
      <nav className="flex-1 flex flex-col py-3 overflow-y-auto">
        <div className={`flex-shrink-0 space-y-0.5 mb-3 ${isOpen ? "px-3" : "px-2"}`}>
          <NavItem
            href="/clients"
            active={pathname.startsWith("/clients")}
            isOpen={isOpen}
            label="Clientes"
            icon={
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
          <NavItem
            href="/icp"
            active={pathname.startsWith("/icp")}
            isOpen={isOpen}
            label="ICP"
            icon={
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="9" strokeWidth={2} />
                <circle cx="12" cy="12" r="5" strokeWidth={2} />
                <circle cx="12" cy="12" r="1.5" strokeWidth={2} />
              </svg>
            }
          />
          {canSeePortfolio && (
            <NavItem
              href="/dashboard"
              active={pathname === "/dashboard"}
              isOpen={isOpen}
              label="Cartera"
              icon={
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            />
          )}
          {canSeeSales && (
            <NavItem
              href="/business-cases"
              active={pathname.startsWith("/business-cases")}
              isOpen={isOpen}
              label="Ventas"
              icon={
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l4-4 3 3 5-6" />
                </svg>
              }
            />
          )}
          {canSeeAudits && (
            <NavItem
              href="/audits"
              active={pathname.startsWith("/audits")}
              isOpen={isOpen}
              label="Auditoría"
              icon={
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              }
            />
          )}
          {canSeeAgents && (
            <NavItem
              href="/agents"
              active={pathname.startsWith("/agents")}
              isOpen={isOpen}
              label="Agentes"
              icon={
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              }
            />
          )}
          <NavItem
            href="/sessions"
            active={pathname.startsWith("/sessions")}
            isOpen={isOpen}
            label="Sesiones"
            icon={
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            }
          />
          <NavItem
            href="/knowledge"
            active={pathname.startsWith("/knowledge")}
            isOpen={isOpen}
            label="Conocimientos"
            icon={
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            }
          />
          {canSeeTeam && (
            <NavItem
              href="/team"
              active={pathname.startsWith("/team")}
              isOpen={isOpen}
              label="Equipo"
              icon={
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              }
            />
          )}
          {canSeeConfig && (
            <NavItem
              href="/integrations"
              active={pathname.startsWith("/integrations")}
              isOpen={isOpen}
              label="Configuración"
              icon={
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                </svg>
              }
            />
          )}
        </div>

        {isOpen && clients.length > 0 && (
          <div className="flex flex-col" style={{ minHeight: 150 }}>
            <div className="border-t border-gray-800/60 mx-3 mb-2" />
            <p className="px-6 pb-1.5 text-2xs font-semibold text-gray-600 uppercase tracking-widest">
              Clientes recientes
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 space-y-0.5">
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

        {/* ── Avatar del usuario logueado (al fondo, con dropdown hacia arriba
                que incluye Configuración + Cerrar sesión) ── */}
        <div className="flex-shrink-0 border-t border-gray-800/60 mt-2 pt-2">
          <div className={isOpen ? "px-2" : "px-1"}>
            <UserAvatar user={user} isOpen={isOpen} />
          </div>
        </div>
      </nav>
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
