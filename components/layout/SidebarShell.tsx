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
  children: React.ReactNode;
}

const STORAGE_KEY = "sidebar_open";

export default function SidebarShell({ clients, user, children }: Props) {
  const pathname = usePathname();
  // Auto-colapsar sidebar en vista detalle de cliente
  const isClientDetail = /^\/clients\/[^/]+\/(projects|stage|documents|settings)/.test(pathname);

  // Leer preferencia guardada (default: abierto)
  const [open, setOpen] = useState(true);
  // En vista de cliente, sidebar inicia colapsada pero el usuario puede expandir manualmente
  const [clientDetailOverride, setClientDetailOverride] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setOpen(saved === "true");
    setMounted(true);

    // Auto-sync Google Meet en background (cooldown 20 min en servidor)
    fetch("/api/integrations/google/auto-sync", { method: "POST" }).catch(() => {});
  }, []);

  // Reset override cuando cambia entre vista cliente y otras
  useEffect(() => {
    setClientDetailOverride(false);
  }, [isClientDetail]);

  const toggle = () => {
    if (isClientDetail) {
      setClientDetailOverride((prev) => !prev);
    } else {
      setOpen((prev) => {
        const next = !prev;
        localStorage.setItem(STORAGE_KEY, String(next));
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
        style={!isClientDetail && !mounted ? { visibility: "hidden" } : undefined}
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
