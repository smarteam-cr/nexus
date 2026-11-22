"use client";

/**
 * useRehacerLaEscala — lo que corre la cuenta regresiva del agente de impacto al llegar a 0 (21 nov): «Rehacer con IA» del
 * Resumen de La escala (POST …/escala/resumen, que respeta lo escrito a mano y nunca publica), después recarga el lienzo
 * y avisa a «Publicar» que hay cambios. Lo comparten «Lo que sabes del cliente» y «Hablar con Nexus».
 *
 * Mientras corre, `useSeRehaceLaEscala` da true en esta pestaña (21 nov): «Usar esta versión» del historial del Resumen no
 * se puede usar mientras tanto. Lo que corre en otra pestaña o lo pide otra persona lo frena el servidor (409).
 */
import { useCallback, useSyncExternalStore } from "react";
import { avisarQueLaEscalaCambio } from "./escala-al-dia";
import { useLienzo } from "./contexto";

export const AVISO_DE_LA_ESCALA_REHECHA =
  "Listo: la página de La escala tiene cambios que el cliente todavía no ve. Revísalos en «La escala» y publica cuando quieras.";

export const CORRIENDO_LA_ESCALA = "Nexus está rehaciendo la página de La escala con tu nota (unos 3 minutos). Lo escrito a mano se queda y nada se publica.";

/** Cuántas corridas de esta pestaña están rehaciendo la escala, por exploración. */
const corriendo = new Map<string, number>();
const AL_CAMBIAR = "nexus:escala-rehaciendo";

function marcar(id: string, cambio: 1 | -1) {
  const n = (corriendo.get(id) ?? 0) + cambio;
  if (n > 0) corriendo.set(id, n);
  else corriendo.delete(id);
  window.dispatchEvent(new Event(AL_CAMBIAR));
}

function suscribir(avisar: () => void) {
  window.addEventListener(AL_CAMBIAR, avisar);
  return () => window.removeEventListener(AL_CAMBIAR, avisar);
}

/** ¿La cuenta regresiva de esta pestaña está rehaciendo el Resumen de esta exploración? */
export function useSeRehaceLaEscala(id: string): boolean {
  return useSyncExternalStore(
    suscribir,
    () => corriendo.has(id),
    () => false,
  );
}

export function useRehacerLaEscala(): () => Promise<string> {
  const { exp, recargar } = useLienzo();
  return useCallback(async () => {
    marcar(exp.id, 1);
    try {
      const r = await fetch(`/api/sales/exploraciones/${exp.id}/escala/resumen`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo rehacer la página de La escala.");
    } finally {
      marcar(exp.id, -1);
    }
    // El Resumen se guarda por su propia ruta: el lienzo se pone al día y «Publicar» vuelve a mirar.
    await recargar();
    avisarQueLaEscalaCambio();
    return AVISO_DE_LA_ESCALA_REHECHA;
  }, [exp.id, recargar]);
}
