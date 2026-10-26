"use client";

/**
 * components/canvas/kickoff-sections/AccesoAlPortalStrip.tsx — el estado del acceso al portal de HubSpot del cliente en el
 * editor del kickoff (Q2 etapa 2, 2026-10-27): pendiente o dado con su fecha, y el botón para marcarlo. Del equipo: va
 * arriba del documento, fuera de lo que ve el cliente (el cliente solo ve que la tarjeta dice «gracias»).
 *
 * También carga lo que el editor necesita para «Tu ruta en HubSpot Academy» (el catálogo y la ruta sugerida): los dos
 * viajan en `ctx.kickoff` (`useAccesoYAcademy`).
 *
 * UI interna: primitivas y tokens, tuteo.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
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
  return { acceso, setAcceso, academia };
}

export default function AccesoAlPortalStrip({
  projectId,
  acceso,
  onCambio,
}: {
  projectId: string;
  acceso: EstadoDelAcceso | null;
  onCambio: (a: EstadoDelAcceso) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();
  const marcar = useCallback(
    async (dado: boolean) => {
      setGuardando(true);
      try {
        const r = await fetch(`/api/projects/${projectId}/acceso-al-portal`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dado }),
        });
        const j = (await r.json().catch(() => null)) as (EstadoDelAcceso & { error?: string }) | null;
        if (!r.ok || !j) {
          toast.error(j?.error ?? "No se pudo guardar. Vuelve a intentarlo.");
          return;
        }
        onCambio({ dadoEn: j.dadoEn, diasHabiles: j.diasHabiles });
      } catch {
        toast.error("Error de conexión.");
      } finally {
        setGuardando(false);
      }
    },
    [projectId, onCambio, toast],
  );
  if (!acceso) return null;
  const fecha = acceso.dadoEn ? new Date(acceso.dadoEn).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" }) : null;
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-wrap items-center gap-3 px-6 pt-3 text-xs">
      <span className="font-semibold text-fg">Acceso al portal de HubSpot del cliente:</span>
      {fecha ? (
        <span className="text-fg-secondary">
          dado el {fecha}
          {acceso.diasHabiles != null ? ` (${acceso.diasHabiles} ${acceso.diasHabiles === 1 ? "día hábil" : "días hábiles"} desde que el kickoff lo pide)` : ""}
        </span>
      ) : (
        <span className="text-fg-secondary">pendiente. Mientras falte, te lo recuerda «Para ti».</span>
      )}
      <Button size="xs" variant={fecha ? "ghost" : "primary"} loading={guardando} onClick={() => void marcar(!fecha)}>
        {fecha ? "Volver a pendiente" : "Ya nos dio acceso"}
      </Button>
    </div>
  );
}
