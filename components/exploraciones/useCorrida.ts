"use client";

/**
 * useCorrida — lanzar al agente de la exploración y seguir su corrida hasta que termina.
 *
 * La corrida vive en el servidor (AgentRun): si el vendedor sale y vuelve, al abrir se consulta la
 * última y, si sigue viva, se retoma el seguimiento. Al terminar recarga el lienzo para que lo
 * propuesto aparezca en su lugar.
 *
 * ⛔ UN seguimiento por exploración, compartido por todas las piezas que usan este hook
 * (lib/exploraciones/seguimiento-de-corrida.ts): con cuatro montadas hay una consulta cada 3 s, una
 * recarga y un aviso por corrida, y todos los botones se enteran de la corrida que lanzó cualquiera.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useToast } from "@/components/ui";
import type { ModoDeLaCorrida } from "@/lib/exploraciones/contenido";
import { FOTO_INICIAL, seguimientoDe } from "@/lib/exploraciones/seguimiento-de-corrida";
import { useLienzo } from "./contexto";

export type { CorridaEnCurso } from "@/lib/exploraciones/seguimiento-de-corrida";

const fotoDelServidor = () => FOTO_INICIAL;

export function useCorrida() {
  const { exp, recargar } = useLienzo();
  const toast = useToast();
  const s = seguimientoDe(exp.id);
  const { corrida, lanzando } = useSyncExternalStore(s.suscribir, s.foto, fotoDelServidor);

  useEffect(() => {
    s.conectar({ recargar, avisos: toast });
  }, [s, recargar, toast]);

  // La versión del lienzo al montar esta pieza (ver `revisar` en el seguimiento).
  const vistaAlMontar = useRef(exp.actualizadaEn);
  useEffect(() => s.montar(vistaAlMontar.current), [s]);

  /** `sesionId`: para leer una reunión de Meet puntual (la de una pestaña de sesión). */
  const lanzar = useCallback(
    async (modo: ModoDeLaCorrida, opciones: { sesionId?: string } = {}) => {
      s.ponerLanzando(true);
      try {
        const res = await fetch(`/api/sales/exploraciones/${exp.id}/agente`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modo, ...(opciones.sesionId ? { sesionId: opciones.sesionId } : {}) }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; yaCorria?: boolean };
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo lanzar el agente.");
          return;
        }
        if (data.yaCorria) toast.info("El agente ya está trabajando en esta preventa: cuando termine, lánzalo de nuevo si hace falta.");
        void s.seguir();
      } finally {
        s.ponerLanzando(false);
      }
    },
    [s, exp.id, toast],
  );

  return { corrida, corriendo: corrida?.estado === "RUNNING", lanzando, lanzar, seguir: s.seguir };
}
