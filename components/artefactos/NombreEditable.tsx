"use client";

/**
 * components/artefactos/NombreEditable.tsx — EL NOMBRE DE UN ARTEFACTO, UNA SOLA VEZ (Elías, 30 oct): el título de arriba se
 * edita ahí mismo, con el lápiz o con doble clic. Enter o salir del campo guardan; Escape deja lo que estaba.
 *
 * UI interna: primitivas de components/ui, tokens semánticos y tuteo.
 */
import { useRef, useState } from "react";
import { IconButton } from "@/components/ui";

export default function NombreEditable({ nombre, onGuardar }: { nombre: string; /** true si quedó guardado. */ onGuardar: (nombre: string) => Promise<boolean> }) {
  const [borrador, setBorrador] = useState<string | null>(null);
  // Enter y salir del campo llegan juntos: sin esto, los Cuestionarios de siempre crearían dos copias.
  const guardando = useRef(false);
  const guardar = async () => {
    if (guardando.current) return;
    const n = borrador?.trim();
    guardando.current = true;
    const listo = !n || n === nombre || (await onGuardar(n));
    guardando.current = false;
    if (listo) setBorrador(null);
  };
  if (borrador === null) {
    return (
      <span className="group/nombre inline-flex min-w-0 items-center gap-1">
        <span className="min-w-0" onDoubleClick={() => setBorrador(nombre)} title="Doble clic para cambiar el nombre">
          {nombre}
        </span>
        <IconButton
          size="sm"
          aria-label="Cambiar el nombre"
          title="Cambiar el nombre"
          onClick={() => setBorrador(nombre)}
          className="flex-shrink-0 opacity-40 transition-opacity focus-visible:opacity-100 group-hover/nombre:opacity-100"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
            </svg>
          }
        />
      </span>
    );
  }
  return (
    <form
      className="inline-flex min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <input
        autoFocus
        value={borrador}
        maxLength={120}
        aria-label="Nombre del documento"
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={() => void guardar()}
        onKeyDown={(e) => {
          if (e.key === "Escape") setBorrador(null);
        }}
        size={Math.max(12, borrador.length + 2)}
        className="max-w-full rounded-md border border-brand bg-surface px-1.5 text-[22px] font-bold leading-tight text-fg focus:outline-none"
      />
    </form>
  );
}
