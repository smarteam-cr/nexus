"use client";

/**
 * components/clients/AvisoDeFicha.tsx — el número junto a la pestaña «Información del cliente»:
 * cuántos campos de la ficha propuso la IA y nadie revisó todavía. Sin él, la propuesta que dejan
 * el handoff y las sesiones quedaría escondida hasta que alguien abriera la pestaña por casualidad.
 */
import { useEffect, useState } from "react";
import { EVENTO_FICHA_CAMBIO, camposPropuestos, type FichaGuardada } from "@/lib/clients/ficha";
import { IconoDeSugerencia } from "@/components/ui/sistema";

export default function AvisoDeFicha({ clientId }: { clientId: string }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let vivo = true;
    const cargar = () =>
      fetch(`/api/clients/${clientId}/ficha`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { ficha?: FichaGuardada } | null) => {
          if (vivo && j?.ficha) setN(camposPropuestos(j.ficha).length);
        })
        .catch(() => {});
    void cargar();
    const alCambiar = (e: Event) => {
      if ((e as CustomEvent<{ clientId?: string }>).detail?.clientId === clientId) void cargar();
    };
    window.addEventListener(EVENTO_FICHA_CAMBIO, alCambiar);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_FICHA_CAMBIO, alCambiar);
    };
  }, [clientId]);

  if (!n) return null;
  /* La forma de lo que sugiere el agente en el sistema «Nexus · interfaz interna»: chispa y
     número en azul sobre azul claro (rediseño de la ficha, 2026-10-04). */
  return (
    <span
      title={`La IA propone cambios en ${n} ${n === 1 ? "campo" : "campos"} de la ficha`}
      className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full border border-info-line bg-info-surface py-0 pl-1 pr-1.5 text-[11px] font-semibold tabular-nums text-brand"
    >
      <IconoDeSugerencia className="h-3 w-3" />
      {n}
    </span>
  );
}
