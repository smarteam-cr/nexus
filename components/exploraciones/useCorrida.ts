"use client";

/**
 * useCorrida — lanzar al agente de la exploración y seguir su corrida hasta que termina.
 *
 * La corrida vive en el servidor (AgentRun): si el vendedor sale y vuelve, al abrir se consulta la
 * última y, si sigue viva, se retoma el seguimiento. Al terminar recarga el lienzo para que lo
 * propuesto aparezca en su lugar. Un solo seguimiento a la vez: dos clics seguidos no duplican los
 * avisos.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import type { ModoDeLaCorrida } from "@/lib/exploraciones/contenido";
import { useLienzo } from "./contexto";

export interface CorridaEnCurso {
  id: string;
  estado: "RUNNING" | "DONE" | "ERROR";
  etiqueta: string | null;
  fase: string | null;
  empezo: string;
  propuestos: number | null;
  nadaNuevo: boolean;
  error: string | null;
}

export function useCorrida() {
  const { exp, recargar } = useLienzo();
  const toast = useToast();
  const [corrida, setCorrida] = useState<CorridaEnCurso | null>(null);
  const [lanzando, setLanzando] = useState(false);
  const vivo = useRef(true);
  const siguiendo = useRef(false);

  const consultar = useCallback(async (): Promise<CorridaEnCurso | null> => {
    try {
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/agente`);
      const data = (await res.json()) as { corrida?: CorridaEnCurso | null };
      return data.corrida ?? null;
    } catch {
      return null;
    }
  }, [exp.id]);

  const seguir = useCallback(async () => {
    if (siguiendo.current) return;
    siguiendo.current = true;
    try {
      for (let i = 0; i < 160 && vivo.current; i++) {
        const c = await consultar();
        if (!vivo.current) return;
        setCorrida(c);
        if (!c || c.estado !== "RUNNING") {
          if (c?.estado === "DONE") {
            await recargar();
            if (c.nadaNuevo) toast.success("No había reuniones nuevas para leer.");
            else
              toast.success(
                c.propuestos
                  ? `El agente propuso ${c.propuestos} ${c.propuestos === 1 ? "cosa" : "cosas"}: están en su lugar.`
                  : "El agente no encontró nada nuevo que proponer.",
              );
          } else if (c?.estado === "ERROR") {
            toast.error(c.error ?? "El agente no pudo terminar.");
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    } finally {
      siguiendo.current = false;
    }
  }, [consultar, recargar, toast]);

  useEffect(() => {
    vivo.current = true;
    void (async () => {
      const c = await consultar();
      if (!vivo.current) return;
      setCorrida(c);
      if (c?.estado === "RUNNING") void seguir();
    })();
    return () => {
      vivo.current = false;
    };
  }, [consultar, seguir]);

  const lanzar = useCallback(
    async (modo: ModoDeLaCorrida) => {
      setLanzando(true);
      try {
        const res = await fetch(`/api/sales/exploraciones/${exp.id}/agente`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modo }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo lanzar el agente.");
          return;
        }
        void seguir();
      } finally {
        setLanzando(false);
      }
    },
    [exp.id, seguir, toast],
  );

  return { corrida, corriendo: corrida?.estado === "RUNNING", lanzando, lanzar };
}
