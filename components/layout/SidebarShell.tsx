"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import type { PermissionMap } from "@/lib/auth/permissions/types";
import Sidebar from "./Sidebar";

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

interface Props {
  clients: ClientSummary[];
  user: UserLite;
  /** Ancho inicial resuelto en SSR desde la cookie `nexus-sidebar` (AppShell). */
  initialOpen: boolean;
  children: React.ReactNode;
}

// Preferencia abierto/colapsado en cookie (patrón nexus-theme): el SSR la lee y el
// primer paint nace con el ancho correcto. localStorage quedó como legacy a migrar.
const COOKIE_KEY = "nexus-sidebar";
const LEGACY_STORAGE_KEY = "sidebar_open";

const writeCookie = (open: boolean) => {
  document.cookie = `${COOKIE_KEY}=${open ? "open" : "collapsed"};path=/;max-age=31536000;SameSite=Lax`;
};

export default function SidebarShell({ clients, user, initialOpen, children }: Props) {
  const pathname = usePathname();
  // Auto-colapsar sidebar en vista detalle de cliente
  const isClientDetail = /^\/clients\/[^/]+\/(projects|stage|documents|settings)/.test(pathname);

  const [open, setOpen] = useState(initialOpen);
  // En vista de cliente, sidebar inicia colapsada pero el usuario puede expandir manualmente
  const [clientDetailOverride, setClientDetailOverride] = useState(false);

  useEffect(() => {
    // Migración one-time desde localStorage: si no hay cookie y el usuario tenía el
    // sidebar colapsado guardado, se respeta (un solo flash, después nunca más).
    if (!document.cookie.includes(`${COOKIE_KEY}=`)) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy !== null) {
        const legacyOpen = legacy === "true";
        writeCookie(legacyOpen);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- migración one-time: el ancho legacy solo se conoce post-mount (localStorage no existe en SSR)
        setOpen(legacyOpen);
      }
    }

    // Auto-sync Google Meet en background (cooldown 20 min en servidor)
    fetch("/api/integrations/google/auto-sync", { method: "POST" }).catch(() => {});
  }, []);

  // Reset del override al cruzar entre vista cliente y otras — patrón "ajustar estado
  // durante el render" (guardado por prev), en vez de un setState dentro de un effect.
  const [prevIsClientDetail, setPrevIsClientDetail] = useState(isClientDetail);
  if (prevIsClientDetail !== isClientDetail) {
    setPrevIsClientDetail(isClientDetail);
    setClientDetailOverride(false);
  }

  const toggle = () => {
    if (isClientDetail) {
      setClientDetailOverride((prev) => !prev);
    } else {
      setOpen((prev) => {
        const next = !prev;
        writeCookie(next);
        return next;
      });
    }
  };

  // En vista detalle: colapsado por defecto, expandible con toggle manual
  const effectiveOpen = isClientDetail ? clientDetailOverride : open;

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar con transición ── */}
      <div
        className={`flex-shrink-0 transition-all duration-200 ease-in-out overflow-hidden ${
          effectiveOpen ? "w-56" : "w-14"
        }`}
      >
        <Sidebar
          clients={clients}
          user={user}
          onToggle={toggle}
          isOpen={effectiveOpen}
        />
      </div>

      {/* ── Contenido ── */}
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
