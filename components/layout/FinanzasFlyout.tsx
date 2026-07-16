"use client";

/**
 * Ítem "Finanzas" del sidebar con submenú flyout (mismo patrón que
 * MarketingFlyout — hover/portal/mounted-guard), agrupando Cobranza · Costos y
 * gastos · Caja neta. Los últimos 2 son SOLO SUPER_ADMIN (isCostosRole) — el
 * filtro vive acá adentro, no en Sidebar.tsx, para no ensuciarlo con lógica de
 * Cobranza. El trigger va a /cobranza (reemplaza 1:1 el NavItem "Cobranza" de
 * antes: no hay una "home de Finanzas").
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCostosRole } from "@/lib/auth/cobranza-roles";

const FINANZAS_NAV_ITEMS = [
  { href: "/cobranza", label: "Cobranza", costosOnly: false },
  { href: "/finanzas/costos", label: "Costos y gastos", costosOnly: true },
  { href: "/finanzas/caja-neta", label: "Caja neta", costosOnly: true },
] as const;

export default function FinanzasFlyout({ isOpen, role }: { isOpen: boolean; role: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard intencional (portal SSR)
  useEffect(() => setMounted(true), []);

  const active = pathname.startsWith("/cobranza") || pathname.startsWith("/finanzas");
  const items = FINANZAS_NAV_ITEMS.filter((i) => !i.costosOnly || isCostosRole(role));

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
        href="/cobranza"
        onClick={() => setOpen(false)}
        title={!isOpen ? "Finanzas" : undefined}
        className={`flex items-center rounded-lg text-sm transition-colors ${
          isOpen ? "gap-2.5 px-3 py-2" : "justify-center p-2.5"
        } ${active ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-900"}`}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
          />
        </svg>
        {isOpen && <span className="truncate flex-1">Finanzas</span>}
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
            className="z-[70] w-56 rounded-xl border border-line bg-surface shadow-2xl py-1.5"
          >
            {items.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-2 mx-1.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-brand/10 text-brand font-medium"
                      : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
