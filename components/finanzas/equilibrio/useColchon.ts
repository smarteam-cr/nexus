"use client";

/**
 * components/finanzas/equilibrio/useColchon.ts — el colchón del piso que eligió quien mira (2026-11-13, pedido de
 * Finanzas 5). Arranca en 15 % y se recuerda en ese navegador: es cómo quiere mirar cada uno, no un dato del negocio.
 *
 * Mismo patrón que las series del mes a mes: un almacén externo (`useSyncExternalStore`) para que el servidor pinte el
 * de por defecto y el cliente lea lo guardado sin un efecto que repinte. `enMemoria` cubre el navegador que no deja
 * guardar (ventana privada): se usa igual, solo no se recuerda.
 */
import { useCallback, useSyncExternalStore } from "react";
import { COLCHON_POR_DEFECTO, normalizarColchon } from "@/lib/finanzas/panorama";

const GUARDADO = "nexus.equilibrio.colchon";
const oyentes = new Set<() => void>();
let enMemoria = String(COLCHON_POR_DEFECTO);

function leer(): string {
  try {
    return window.localStorage.getItem(GUARDADO) ?? enMemoria;
  } catch {
    return enMemoria;
  }
}

function suscribir(o: () => void) {
  oyentes.add(o);
  window.addEventListener("storage", o);
  return () => {
    oyentes.delete(o);
    window.removeEventListener("storage", o);
  };
}

export function useColchon(): [number, (pct: number) => void] {
  const crudo = useSyncExternalStore(suscribir, leer, () => String(COLCHON_POR_DEFECTO));
  const cambiar = useCallback((pct: number) => {
    enMemoria = String(normalizarColchon(pct));
    try {
      window.localStorage.setItem(GUARDADO, enMemoria);
    } catch {
      /* Sin almacenamiento: se usa igual, solo no se recuerda. */
    }
    for (const o of oyentes) o();
  }, []);
  return [normalizarColchon(crudo), cambiar];
}
