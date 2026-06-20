"use client";

import { useEffect, useState } from "react";

export interface Me {
  email: string;
  name: string;
  role: string | null;
  isSuperAdmin: boolean;
  capabilities: string[];
}

/**
 * Rol + capacidades del usuario interno logueado (vía GET /api/me), para gating
 * COSMÉTICO de la UI (ocultar acciones que el rol no puede ejecutar). La
 * seguridad real vive en cada endpoint. Devuelve null mientras carga.
 */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setMe(d as Me);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return me;
}
