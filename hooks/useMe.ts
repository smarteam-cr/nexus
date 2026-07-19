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

// Cache de módulo: la identidad no cambia dentro de una sesión del browser, pero el
// hook se monta en decenas de componentes — sin cache, CADA montaje re-pegaba a
// /api/me y los gates por permiso (ej. el bloque de contexto del Handoff) aparecían
// tarde, empujando el layout. La promesa in-flight dedupea montajes simultáneos.
let cachedMe: Me | null = null;
let inflight: Promise<Me | null> | null = null;

function fetchMe(): Promise<Me | null> {
  if (cachedMe) return Promise.resolve(cachedMe);
  if (!inflight) {
    inflight = fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        cachedMe = (d as Me) ?? null;
        return cachedMe;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Rol + permisos efectivos del usuario interno logueado (vía GET /api/me), para
 * gating COSMÉTICO de la UI (ocultar acciones que el usuario no puede ejecutar).
 * La seguridad real vive en cada endpoint. Devuelve null mientras carga; con el
 * cache de módulo, después del primer fetch resuelve al instante en todo montaje.
 *
 * Chequear una celda: me?.permissions.sections.cronograma?.regenerate === true
 */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(cachedMe);
  useEffect(() => {
    if (cachedMe) return; // ya seteado como estado inicial
    let active = true;
    void fetchMe().then((d) => {
      if (active && d) setMe(d);
    });
    return () => {
      active = false;
    };
  }, []);
  return me;
}
