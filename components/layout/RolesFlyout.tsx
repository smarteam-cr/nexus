"use client";

/**
 * Ítem "Roles" del sidebar con submenú flyout (mismo patrón que FinanzasFlyout —
 * hover/portal/mounted-guard). Lista los perfiles de puesto del equipo; cada uno
 * abre su página. La sección entera es SOLO SUPER_ADMIN (el gate cosmético vive en
 * Sidebar.tsx: `{isSuperAdmin && <RolesFlyout/>}`), así que la lista se carga
 * client-side sin filtrar por rol. El trigger va a /roles (índice de administración).
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchJson } from "@/lib/api/fetch-json";

interface RoleLink {
  id: string;
  title: string;
}

export default function RolesFlyout({ isOpen }: { isOpen: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [roles, setRoles] = useState<RoleLink[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard intencional (portal SSR)
  useEffect(() => setMounted(true), []);

  // Lista de roles para el submenú (solo se monta para SUPER_ADMIN → sin fuga).
  useEffect(() => {
    let alive = true;
    fetchJson<{ roles: { id: string; title: string }[] }>("/api/roles")
      .then((d) => {
        if (alive) setRoles(d.roles.map((r) => ({ id: r.id, title: r.title })));
      })
      .catch(() => {
        /* silencioso: si falla, el flyout muestra solo "Ver todos" */
      });
    return () => {
      alive = false;
    };
  }, []);

  const active = pathname.startsWith("/roles");

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
        href="/roles"
        onClick={() => setOpen(false)}
        title={!isOpen ? "Roles" : undefined}
        className={`flex items-center rounded-lg text-sm transition-colors ${
          isOpen ? "gap-2.5 px-3 py-2" : "justify-center p-2.5"
        } ${active ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-900"}`}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 012-2h0a2 2 0 012 2v1m-4 0h4m-5 6a2 2 0 104 0 2 2 0 00-4 0zm5.5 5.5a3.5 3.5 0 00-7 0"
          />
        </svg>
        {isOpen && <span className="truncate flex-1">Roles</span>}
        {isOpen && (
          <svg className="w-3 h-3 flex-shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            className="z-[70] max-h-[70vh] w-60 overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl py-1.5"
          >
            <Link
              href="/roles"
              onClick={() => setOpen(false)}
              className={`block px-3 py-2 mx-1.5 rounded-lg text-sm transition-colors ${
                pathname === "/roles"
                  ? "bg-brand/10 text-brand font-medium"
                  : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
              }`}
            >
              Todos los roles
            </Link>
            {roles.length > 0 && <div className="my-1 mx-3 border-t border-line" />}
            {roles.map((r) => {
              const isActive = pathname === `/roles/${r.id}`;
              return (
                <Link
                  key={r.id}
                  href={`/roles/${r.id}`}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-2 mx-1.5 rounded-lg text-sm transition-colors truncate ${
                    isActive
                      ? "bg-brand/10 text-brand font-medium"
                      : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                  }`}
                >
                  {r.title}
                </Link>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
