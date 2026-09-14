"use client";

/**
 * components/documentacion/comentarios/HiloFlotante.tsx — el globo con uno o más hilos, debajo del
 * texto resaltado o del número del margen (un bloque puede tener varios hilos abiertos).
 */
import { useRef } from "react";
import { usePopoverDismiss } from "@/components/ui/usePopoverDismiss";
import { Z } from "@/lib/ui/z";
import { ANCHO_DE_GLOBO, useComentarios } from "./ContextoDeComentarios";
import HiloContenido from "./HiloContenido";

export default function HiloFlotante() {
  const { flotante, cerrarFlotante, hilos } = useComentarios();
  const ref = useRef<HTMLDivElement>(null);
  usePopoverDismiss(!!flotante, cerrarFlotante, ref);

  if (!flotante) return null;
  const lista = flotante.hiloIds
    .map((id) => hilos.find((h) => h.id === id))
    .filter((h): h is NonNullable<typeof h> => !!h);
  if (lista.length === 0) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Comentarios"
      className="absolute max-h-[28rem] max-w-[calc(100%-16px)] overflow-y-auto rounded-xl border border-line bg-surface p-3 shadow-xl"
      style={{ top: flotante.posicion.top, left: flotante.posicion.left, width: ANCHO_DE_GLOBO, zIndex: Z.POPOVER }}
    >
      {lista.map((h, i) => (
        <div key={h.id} className={i > 0 ? "mt-3 border-t border-line pt-3" : undefined}>
          <HiloContenido hilo={h} />
        </div>
      ))}
    </div>
  );
}
