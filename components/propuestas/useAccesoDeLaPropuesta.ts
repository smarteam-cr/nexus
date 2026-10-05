"use client";

/**
 * useAccesoDeLaPropuesta — el estado del link de la propuesta (GET/PATCH
 * /api/business-cases/[id]/external-access), en UN solo lugar de la ficha.
 *
 * Lo leen el paso Compartir, la barra de pasos («La abrió el 2 oct») y «Qué sigue»: si cada uno
 * pidiera el suyo, después de «Quitar la aprobación» la barra seguiría diciendo «Aprobada».
 */
import { useCallback, useEffect, useState } from "react";

export interface AprobacionDelCliente {
  approvedAt: string;
  approvedByEmail: string | null;
  approvedByName: string | null;
  /** Aprobó una versión anterior a la que está subida hoy. */
  desactualizada: boolean;
}

export interface AccesoDeLaPropuesta {
  exists: boolean;
  url?: string;
  expiresAt?: string | null;
  enabledAt?: string | null;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
  approval: AprobacionDelCliente | null;
}

const VACIO: AccesoDeLaPropuesta = { exists: false, approval: null };

export function useAccesoDeLaPropuesta(bcId: string, refreshKey: number) {
  const [acceso, setAcceso] = useState<AccesoDeLaPropuesta | null>(null);

  const recargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/business-cases/${bcId}/external-access`);
      setAcceso(r.ok ? ((await r.json()) as AccesoDeLaPropuesta) : VACIO);
    } catch {
      setAcceso(VACIO);
    }
  }, [bcId]);

  // La carga va en línea (el setState es después del fetch), y se vuelve a pedir con cada `refreshKey`.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch(`/api/business-cases/${bcId}/external-access`);
        const d = r.ok ? ((await r.json()) as AccesoDeLaPropuesta) : VACIO;
        if (vivo) setAcceso(d);
      } catch {
        if (vivo) setAcceso(VACIO);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [bcId, refreshKey]);

  /** PATCH de la caducidad o de la aprobación. Devuelve el error, o null si salió bien. */
  const ajustar = useCallback(
    async (body: { expiresInDays?: number | null; clearApproval?: true }): Promise<string | null> => {
      try {
        const r = await fetch(`/api/business-cases/${bcId}/external-access`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string };
          await recargar();
          return d.error ?? "No se pudo guardar el cambio.";
        }
        setAcceso((await r.json()) as AccesoDeLaPropuesta);
        return null;
      } catch {
        return "No se pudo guardar el cambio.";
      }
    },
    [bcId, recargar],
  );

  const revocar = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch(`/api/business-cases/${bcId}/revoke`, { method: "POST" });
      await recargar();
      return r.ok;
    } catch {
      return false;
    }
  }, [bcId, recargar]);

  const linkVivo = !!acceso?.exists && !acceso.revokedAt;
  return { acceso, linkVivo, recargar, ajustar, revocar };
}
