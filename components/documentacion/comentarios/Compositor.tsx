"use client";

/**
 * components/documentacion/comentarios/Compositor.tsx — el globo para escribir un comentario nuevo.
 *
 * Aparece debajo del texto marcado (o del bloque). Un clic afuera lo cierra solo si no se escribió
 * nada: un borrador no se pierde por un clic de más.
 */
import { useEffect, useRef, useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { Z } from "@/lib/ui/z";
import { ANCHO_DE_GLOBO, useComentarios } from "./ContextoDeComentarios";
import { CitaDelHilo, esEnviar } from "./HiloContenido";

export default function Compositor() {
  const { borrador, descartarBorrador, crear } = useComentarios();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const vacio = !texto.trim();

  useEffect(() => {
    if (!borrador) return;
    const alPresionar = (e: MouseEvent) => {
      if (vacio && ref.current && !ref.current.contains(e.target as Node)) descartarBorrador();
    };
    document.addEventListener("mousedown", alPresionar);
    return () => document.removeEventListener("mousedown", alPresionar);
  }, [borrador, descartarBorrador, vacio]);

  if (!borrador) return null;

  const enviar = async () => {
    if (vacio || enviando) return;
    setEnviando(true);
    await crear(texto.trim());
    setEnviando(false);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Nuevo comentario"
      className="absolute max-w-[calc(100%-16px)] rounded-xl border border-line bg-surface p-3 shadow-xl"
      style={{ top: borrador.posicion.top, left: borrador.posicion.left, width: ANCHO_DE_GLOBO, zIndex: Z.POPOVER }}
    >
      <div className="mb-2">
        <CitaDelHilo cita={borrador.ancla.cita} />
      </div>
      <Textarea
        autoFocus
        rows={3}
        value={texto}
        placeholder="Escribe un comentario…"
        aria-label="Comentario"
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (esEnviar(e)) void enviar();
          if (e.key === "Escape") descartarBorrador();
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-2xs text-fg-muted">Ctrl+Enter para enviar</span>
        <div className="flex gap-1.5">
          <Button size="xs" variant="secondary" onClick={descartarBorrador}>
            Cancelar
          </Button>
          <Button size="xs" variant="primary" loading={enviando} disabled={vacio} onClick={() => void enviar()}>
            Comentar
          </Button>
        </div>
      </div>
    </div>
  );
}
