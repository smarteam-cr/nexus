"use client";

/**
 * components/layout/NavFlyout.tsx — EL flyout del sidebar (único).
 *
 * Antes había 3 copias casi idénticas (MarketingFlyout / FinanzasFlyout /
 * RolesFlyout, ~350 líneas totales) del mismo esqueleto: trigger estilo NavItem +
 * panel portal a document.body con hover/close-timer y coords fixed desde el
 * trigger (escapa del overflow-hidden del rail). Ahora el esqueleto vive UNA vez
 * y los hijos vienen del nav-config; el 6º proceso con submenú es una entrada de
 * config, no una 4ª copia.
 *
 * El trigger respeta la estética del rail (fondo oscuro fijo vía tokens exactos);
 * el panel usa tokens de superficie para adaptarse a claro/oscuro (portal: no
 * hereda — ni debe heredar — el fondo del rail).
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchJson } from "@/lib/api/fetch-json";
import type { NavChildConfig, NavItemConfig } from "./nav-config";

interface PanelItem {
  href: string;
  label: string;
  match?: readonly string[];
  /** Activo por igualdad exacta (roles) en vez de startsWith. */
  exact?: boolean;
  separatorBefore?: boolean;
}

export default function NavFlyout({
  item,
  items,
  isOpen,
}: {
  item: Pick<NavItemConfig, "href" | "label" | "icon" | "match">;
  items: readonly PanelItem[];
  isOpen: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard intencional (portal SSR)
  useEffect(() => setMounted(true), []);

  const active = (item.match ?? [item.href]).some((p) => pathname.startsWith(p));

  const openFlyout = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.top, left: rect.right + 8 });
    setOpen(true);
  }, []);
  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative" onMouseEnter={openFlyout} onMouseLeave={scheduleClose}>
      <Link
        href={item.href}
        onClick={() => setOpen(false)}
        title={!isOpen ? item.label : undefined}
        className={`flex items-center rounded-lg text-sm transition-colors ${
          isOpen ? "gap-2.5 px-3 py-2" : "justify-center p-2.5"
        } ${active ? "bg-surface-hover text-fg" : "text-fg-muted hover:text-fg hover:bg-surface-muted"}`}
      >
        {item.icon}
        {isOpen && <span className="truncate flex-1">{item.label}</span>}
        {isOpen && (
          <svg className="w-3 h-3 flex-shrink-0 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </Link>

      {mounted &&
        open &&
        coords &&
        createPortal(
          <div
            onMouseEnter={openFlyout}
            onMouseLeave={scheduleClose}
            style={{ position: "fixed", top: coords.top, left: coords.left }}
            className="z-[70] max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl py-1.5"
          >
            {items.map((child) => {
              const childActive = child.exact
                ? pathname === child.href
                : (child.match ?? [child.href]).some((p) => pathname.startsWith(p));
              return (
                <div key={child.href}>
                  {child.separatorBefore && <div className="my-1 mx-3 border-t border-line" />}
                  <Link
                    href={child.href}
                    onClick={() => setOpen(false)}
                    className={`block px-3 py-2 mx-1.5 rounded-lg text-sm transition-colors truncate ${
                      childActive
                        ? "bg-brand/10 text-brand font-medium"
                        : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                    }`}
                  >
                    {child.label}
                  </Link>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Flyout de Roles: hijos DINÁMICOS (la lista de perfiles viene de /api/roles).
 * Solo se monta para SUPER_ADMIN (gate del nav-config) → sin fuga del listado.
 */
export function RolesNavFlyout({
  item,
  isOpen,
}: {
  item: Pick<NavItemConfig, "href" | "label" | "icon" | "match">;
  isOpen: boolean;
}) {
  const [roles, setRoles] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    let alive = true;
    fetchJson<{ roles: { id: string; title: string }[] }>("/api/roles")
      .then((d) => {
        if (alive) setRoles(d.roles.map((r) => ({ id: r.id, title: r.title })));
      })
      .catch(() => {
        /* sin lista: el flyout muestra solo "Todos los roles" */
      });
    return () => {
      alive = false;
    };
  }, []);

  const items: PanelItem[] = [
    { href: "/roles", label: "Todos los roles", exact: true },
    ...roles.map((r, i) => ({
      href: `/roles/${r.id}`,
      label: r.title,
      exact: true,
      separatorBefore: i === 0,
    })),
  ];

  return <NavFlyout item={item} items={items} isOpen={isOpen} />;
}

export type { NavChildConfig };
