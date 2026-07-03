"use client";

/**
 * Ítem "Marketing" del sidebar con submenú flyout (hover/click), como el patrón
 * de HubSpot: al pasar el mouse se abre un panel con las secciones del área,
 * agrupadas. Reemplaza la fila de tabs in-page (MarketingNav, retirada) — la
 * navegación entre secciones de Marketing vive acá. El trigger respeta la
 * estética del resto del rail (grises literales, como los demás NavItem); el
 * panel flyout en sí usa tokens semánticos para adaptarse a claro/oscuro
 * (portal a document.body, por eso no puede heredar el fondo oscuro fijo del
 * rail — y no debería: HubSpot inspira la ESTRUCTURA, no los colores fijos).
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface FlyoutLink {
  href: string;
  label: string;
}
interface FlyoutSection {
  label: string;
  items: FlyoutLink[];
}

const SECTIONS: FlyoutSection[] = [
  {
    label: "Generación de contenido",
    items: [
      { href: "/marketing/contenido", label: "Contenido" },
      { href: "/marketing/generacion", label: "Generación" },
      { href: "/marketing/ideas-de-campana", label: "Ideas de campaña" },
      { href: "/marketing/temas", label: "Temas" },
      { href: "/marketing/fuentes", label: "Fuentes" },
    ],
  },
  {
    label: "Audiencia",
    items: [
      { href: "/marketing/icp", label: "ICP" },
      { href: "/marketing/personas", label: "Buyer personas" },
    ],
  },
];
const DIRECT_ITEM: FlyoutLink = { href: "/marketing/voz", label: "Voz de marca" };

export default function MarketingFlyout({ isOpen }: { isOpen: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard intencional (portal SSR)
  useEffect(() => setMounted(true), []);

  const active = pathname.startsWith("/marketing") || pathname.startsWith("/contenido");

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
        href="/marketing"
        onClick={() => setOpen(false)}
        title={!isOpen ? "Marketing" : undefined}
        className={`flex items-center rounded-lg text-sm transition-colors ${
          isOpen ? "gap-2.5 px-3 py-2" : "justify-center p-2.5"
        } ${active ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-900"}`}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
        </svg>
        {isOpen && <span className="truncate flex-1">Marketing</span>}
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
            className="z-[70] w-64 rounded-xl border border-line bg-surface shadow-2xl py-2"
          >
            {SECTIONS.map((section) => (
              <div key={section.label} className="px-2 py-1.5">
                <p className="px-2 mb-1 text-2xs font-semibold uppercase tracking-widest text-fg-muted">
                  {section.label}
                </p>
                {section.items.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`block px-2 py-1.5 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-brand/10 text-brand font-medium"
                          : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
            <div className="my-1 border-t border-line" />
            <div className="px-2 py-1.5">
              <Link
                href={DIRECT_ITEM.href}
                onClick={() => setOpen(false)}
                className={`block px-2 py-1.5 rounded-lg text-sm transition-colors ${
                  pathname.startsWith(DIRECT_ITEM.href)
                    ? "bg-brand/10 text-brand font-medium"
                    : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                }`}
              >
                {DIRECT_ITEM.label}
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
