"use client";

/**
 * components/canvas/kickoff-sections/useAccesoYAcademy.ts — lo que el editor del kickoff necesita para sus dos secciones
 * vivas: si el cliente ya nos dio acceso al portal (la tarjeta dice «gracias») y el catálogo de HubSpot Academy con la ruta
 * sugerida. Viajan en `ctx.kickoff`. Marcar el acceso se hace en el Resumen (components/clients/AlertaDeAccesoAlPortal.tsx).
 */
import { useEffect, useState } from "react";
import type { ListaDelCatalogo, ListaEnElKickoff } from "@/lib/kickoff/academy";

export interface EstadoDelAcceso {
  dadoEn: string | null;
  diasHabiles: number | null;
}

/** El acceso al portal y el catálogo de Academy del proyecto, para el editor del kickoff. */
export function useAccesoYAcademy(projectId: string) {
  const [acceso, setAcceso] = useState<EstadoDelAcceso | null>(null);
  const [academia, setAcademia] = useState<{ sugerida: ListaEnElKickoff[]; catalogo: ListaDelCatalogo[] } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/acceso-al-portal`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: EstadoDelAcceso | null) => vivo && setAcceso(j ? { dadoEn: j.dadoEn, diasHabiles: j.diasHabiles } : null))
      .catch(() => {});
    fetch(`/api/projects/${projectId}/academy`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { sugerida?: ListaEnElKickoff[]; catalogo?: ListaDelCatalogo[] } | null) =>
        vivo && setAcademia({ sugerida: j?.sugerida ?? [], catalogo: j?.catalogo ?? [] }),
      )
      .catch(() => vivo && setAcademia({ sugerida: [], catalogo: [] }));
    return () => {
      vivo = false;
    };
  }, [projectId]);
  return { acceso, academia };
}
