"use client";

/**
 * useRehacerLaEscala — lo que corre la cuenta regresiva del agente de impacto al llegar a 0 (21 nov): «Rehacer con IA» del
 * Resumen de La escala (POST …/escala/resumen, que respeta lo escrito a mano y nunca publica), después recarga el lienzo
 * y avisa a «Publicar» que hay cambios. Lo comparten «Lo que sabes del cliente» y «Hablar con Nexus».
 */
import { useCallback } from "react";
import { avisarQueLaEscalaCambio } from "./escala-al-dia";
import { useLienzo } from "./contexto";

export const AVISO_DE_LA_ESCALA_REHECHA =
  "Listo: la página de La escala tiene cambios que el cliente todavía no ve. Revísalos en «La escala» y publica cuando quieras.";

export const CORRIENDO_LA_ESCALA = "Nexus está rehaciendo la página de La escala con tu nota (unos 3 minutos). Lo escrito a mano se queda y nada se publica.";

export function useRehacerLaEscala(): () => Promise<string> {
  const { exp, recargar } = useLienzo();
  return useCallback(async () => {
    const r = await fetch(`/api/sales/exploraciones/${exp.id}/escala/resumen`, { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) throw new Error(j.error ?? "No se pudo rehacer la página de La escala.");
    // El Resumen se guarda por su propia ruta: el lienzo se pone al día y «Publicar» vuelve a mirar.
    await recargar();
    avisarQueLaEscalaCambio();
    return AVISO_DE_LA_ESCALA_REHECHA;
  }, [exp.id, recargar]);
}
