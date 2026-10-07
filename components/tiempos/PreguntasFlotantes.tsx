"use client";

/**
 * components/tiempos/PreguntasFlotantes.tsx — la pregunta que sale al publicar un documento (2026-10-05).
 *
 * Los documentos se publican desde el pop-up «Acceso», que se cierra enseguida; por eso la pregunta no vive dentro de
 * él sino en una tarjeta fija abajo a la derecha, montada una vez en el shell. Quien publica llama a
 * `mostrarPreguntaDeTiempo` con lo que devolvió la ruta, y la tarjeta queda hasta que se responda o se cierre
 * (cerrada, la pregunta sigue en «Para ti»).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Z } from "@/lib/ui/z";
import type { PreguntaParaResponder } from "@/lib/tiempos/tipos";
import PreguntaDeTiempo from "./PreguntaDeTiempo";

const EVENTO = "nexus:pregunta-de-tiempo";

/** Muestra la pregunta en la tarjeta fija. `null` o una lista vacía no hacen nada. */
export function mostrarPreguntaDeTiempo(p: PreguntaParaResponder | null | undefined): void {
  if (!p || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PreguntaParaResponder>(EVENTO, { detail: p }));
}

export default function PreguntasFlotantes() {
  // Solo se llena por el evento, que existe en el navegador: no hace falta esperar a «montado» para el portal.
  const [pregunta, setPregunta] = useState<PreguntaParaResponder | null>(null);

  useEffect(() => {
    const escuchar = (e: Event) => setPregunta((e as CustomEvent<PreguntaParaResponder>).detail);
    window.addEventListener(EVENTO, escuchar);
    return () => window.removeEventListener(EVENTO, escuchar);
  }, []);

  if (!pregunta) return null;
  return createPortal(
    <div className="fixed bottom-6 right-6 w-[400px] max-w-[calc(100vw-32px)]" style={{ zIndex: Z.POPOVER }}>
      <PreguntaDeTiempo
        key={pregunta.id}
        pregunta={pregunta}
        variante="tarjeta"
        onCerrar={() => setPregunta(null)}
        onListo={() => window.setTimeout(() => setPregunta((p) => (p?.id === pregunta.id ? null : p)), 5000)}
      />
    </div>,
    document.body,
  );
}
