"use client";

import { useEffect, useState } from "react";
import type { PermissionMap } from "@/lib/auth/permissions/types";

export interface Me {
  email: string;
  name: string;
  role: string | null;
  isSuperAdmin: boolean;
  /** @deprecated derivadas de `permissions` — preferir el mapa sección×acción. */
  capabilities: string[];
  /** Mapa EFECTIVO sección×acción (default ← plantilla del rol ← overrides). */
  permissions: PermissionMap;
}

/**
 * Rol + permisos efectivos del usuario interno logueado (vía GET /api/me), para
 * gating COSMÉTICO de la UI (ocultar acciones que el usuario no puede ejecutar).
 * La seguridad real vive en cada endpoint. Devuelve null mientras carga.
 *
 * Chequear una celda: me?.permissions.sections.cronograma?.regenerate === true
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
