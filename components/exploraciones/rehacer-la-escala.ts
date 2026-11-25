"use client";

/**
 * useRehacerLaEscala — lo que corre la cuenta regresiva del agente de impacto al llegar a 0 (21 nov): «Rehacer con IA» del
 * Resumen de La escala (POST …/escala/resumen, que respeta lo escrito a mano y nunca publica), después recarga el lienzo
 * y avisa a «Publicar» que hay cambios. Lo comparten «Lo que sabes del cliente» y «Hablar con Nexus».
 *
 * Desde el 24 nov el POST arranca la corrida y responde enseguida: se espera a que termine con el MISMO seguimiento de la
 * página (useResumenEnCurso.ts). Así la página de La escala muestra en qué va, y «Usar esta versión» del historial espera
 * (lo frena `corriendo` del seguimiento; antes, un contador de esta pestaña). Lo que corre en otra pestaña o lo pide otra
 * persona lo frena el servidor (409).
 * Si ya corría una (otra pestaña, el botón), esa leyó las notas antes de la que se acaba de guardar (`ajena`): al terminar
 * se rehace UNA vez más, que es lo que pidió la cuenta regresiva de esta nota (revisión del 24 nov: decía «Listo» y la nota
 * no había entrado).
 */
import { useCallback } from "react";
import { avisarQueLaEscalaCambio } from "./escala-al-dia";
import { useLienzo } from "./contexto";
import { seguimientoDelResumen } from "./useResumenEnCurso";

export const AVISO_DE_LA_ESCALA_REHECHA =
  "Listo: la página de La escala tiene cambios que el cliente todavía no ve. Revísalos en «La escala» y publica cuando quieras.";

export const CORRIENDO_LA_ESCALA = "Nexus está rehaciendo la página de La escala con tu nota (unos 3 minutos). Lo escrito a mano se queda y nada se publica.";

export function useRehacerLaEscala(): () => Promise<string> {
  const { exp, recargar } = useLienzo();
  return useCallback(async () => {
    const seguimiento = seguimientoDelResumen(exp.id);
    let r = await seguimiento.armar();
    // Siguió una que ya corría: no leyó esta nota. Una vez más, con todo lo de ahora.
    if (r.ok && r.ajena) r = await seguimiento.armar();
    if (!r.ok) throw new Error(r.error);
    // El Resumen se guarda por su propia ruta: el lienzo se pone al día y «Publicar» vuelve a mirar.
    await recargar();
    avisarQueLaEscalaCambio();
    return AVISO_DE_LA_ESCALA_REHECHA;
  }, [exp.id, recargar]);
}
