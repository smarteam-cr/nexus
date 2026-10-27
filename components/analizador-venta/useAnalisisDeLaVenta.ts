"use client";

/**
 * useAnalisisDeLaVenta — el análisis de la venta de una preventa, compartido entre la pieza «Análisis» (S5), «Cómo
 * trabajaste esta sesión» (S4) y el punto de la pieza en el riel (2026-10-27). Una sola lectura por preventa: lo guarda un
 * almacén de módulo y cada pantalla se suscribe; analizar o revisar vuelve a leer para todas.
 *
 * Solo se pide si quien mira ve el análisis (`activo`: quien entra a la preventa, lo mismo que pide la ruta).
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { fetchJson } from "@/lib/api/fetch-json";
import type { Revision } from "@/lib/analizador-venta/schema";
import type { AnalisisDelProspecto } from "@/lib/analizador-venta/pieza-server";

export interface EstadoDelAnalisis {
  cargando: boolean;
  datos: AnalisisDelProspecto | null;
  error: string | null;
}

const VACIO: EstadoDelAnalisis = { cargando: false, datos: null, error: null };
const almacen = new Map<string, EstadoDelAnalisis>();
const pedidos = new Map<string, Promise<void>>();
const oyentes = new Set<() => void>();

function poner(id: string, e: EstadoDelAnalisis) {
  almacen.set(id, e);
  for (const o of oyentes) o();
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

const base = (id: string) => `/api/sales/exploraciones/${encodeURIComponent(id)}/analisis-de-venta`;

function leer(id: string): Promise<void> {
  const enCurso = pedidos.get(id);
  if (enCurso) return enCurso;
  poner(id, { ...(almacen.get(id) ?? VACIO), cargando: true });
  const p = fetchJson<AnalisisDelProspecto>(base(id))
    .then((datos) => poner(id, { cargando: false, datos, error: null }))
    .catch((e: unknown) => poner(id, { cargando: false, datos: almacen.get(id)?.datos ?? null, error: e instanceof Error ? e.message : "No se pudo leer el análisis." }))
    .finally(() => pedidos.delete(id));
  pedidos.set(id, p);
  return p;
}

export function useAnalisisDeLaVenta(exploracionId: string, activo: boolean) {
  const estado = useSyncExternalStore(
    suscribir,
    () => almacen.get(exploracionId) ?? VACIO,
    () => VACIO,
  );
  useEffect(() => {
    if (activo && !almacen.has(exploracionId)) void leer(exploracionId);
  }, [activo, exploracionId]);

  const recargar = useCallback(() => leer(exploracionId), [exploracionId]);

  /** Analiza (o vuelve a analizar) una reunión. Gasta IA. */
  const analizar = useCallback(
    async (sessionId: string) => {
      const r = await fetchJson<{ juicios: number; descartados: number }>(base(exploracionId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      await leer(exploracionId);
      return r;
    },
    [exploracionId],
  );

  /** Confirma o desconfirma un análisis. */
  const revisar = useCallback(
    async (cuerpo: Revision) => {
      await fetchJson(`${base(exploracionId)}/revision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      await leer(exploracionId);
    },
    [exploracionId],
  );

  return { ...estado, recargar, analizar, revisar };
}
