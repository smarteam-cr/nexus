"use client";

import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";

interface ClientSummary {
  id: string;
  name: string;
  company: string | null;
  hubspotAccount: { id: string; hubName: string | null } | null;
}

interface Props {
  clients: ClientSummary[];
  children: React.ReactNode;
}

const STORAGE_KEY = "sidebar_open";

export default function SidebarShell({ clients, children }: Props) {
  // Leer preferencia guardada (default: abierto)
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setOpen(saved === "true");
    setMounted(true);
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar con transición ── */}
      <div
        className={`flex-shrink-0 transition-all duration-200 ease-in-out overflow-hidden ${
          open ? "w-56" : "w-14"
        }`}
        style={{ visibility: mounted ? "visible" : "hidden" }}
      >
        <Sidebar clients={clients} onToggle={toggle} isOpen={open} />
      </div>

      {/* ── Contenido ── */}
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
