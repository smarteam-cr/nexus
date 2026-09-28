"use client";

/**
 * components/clients/AvisoDeFicha.tsx — el número junto a la pestaña «Información del cliente»:
 * cuántos campos de la ficha propuso la IA y nadie revisó todavía. Sin él, la propuesta que dejan
 * el handoff y las sesiones quedaría escondida hasta que alguien abriera la pestaña por casualidad.
 */
import { useEffect, useState } from "react";
import { EVENTO_FICHA_CAMBIO, camposPropuestos, type FichaGuardada } from "@/lib/clients/ficha";

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
  return (
    <span
      title={`La IA propone cambios en ${n} ${n === 1 ? "campo" : "campos"} de la ficha`}
      className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-brand text-primary-fg text-[10px] font-semibold inline-flex items-center justify-center tabular-nums"
    >
      {n}
    </span>
  );
}
