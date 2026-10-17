"use client";

/**
 * El ciclo abierto de un proyecto recurrente, para los artefactos del ciclo (Diagnóstico, Plan, Cronograma,
 * Aprendizaje). Lee `GET /api/projects/[id]/ciclo` y manda los cambios; después de cada cambio recarga y avisa
 * al riel (`onCambio`) para que la fila y el «Qué sigue» se pongan al día.
 */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import type { EstadoDelCiclo } from "@/lib/servicios/ciclos-server";

export type EstadoConPermiso = EstadoDelCiclo & { puedeEditar: boolean };

export function useCiclo(projectId: string, onCambio?: () => void) {
  const toast = useToast();
  const [estado, setEstado] = useState<EstadoConPermiso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/ciclo`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "No se pudo cargar el ciclo.");
      return;
    }
    setError(null);
    setEstado(data as EstadoConPermiso);
  }, [projectId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Manda un cambio (`ruta` relativa a /ciclo), recarga y avisa al riel. Devuelve si salió bien. */
  const enviar = useCallback(
    async (ruta: "" | "/casos" | "/cierre", method: "POST" | "PATCH", body: unknown, ok?: string): Promise<boolean> => {
      setGuardando(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/ciclo${ruta}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(data?.error ?? "No se pudo guardar.");
          return false;
        }
        if (ok) toast.success(ok);
        await cargar();
        onCambio?.();
        return true;
      } finally {
        setGuardando(false);
      }
    },
    [projectId, cargar, onCambio, toast],
  );

  return { estado, error, guardando, enviar };
}
