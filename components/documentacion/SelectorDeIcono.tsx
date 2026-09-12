"use client";

/**
 * components/documentacion/SelectorDeIcono.tsx — el ícono de una página.
 *
 * Es una GRILLA, no una lista. La primera versión reusó `Menu`, que apila un ítem por fila: con
 * cuarenta emojis quedaba una columna de cuarenta renglones altísima, tapando media pantalla para
 * elegir un dibujo de 16 píxeles. Un selector de íconos se escanea con la vista, no se lee.
 *
 * La mecánica flotante sí es la de la casa (`usePanelFlotante`): posición fija calculada desde el
 * botón —así no lo recorta ningún contenedor con scroll—, el scroll externo cierra, Escape
 * devuelve el foco al botón y las flechas recorren las opciones.
 */
import { cn } from "@/lib/cn";
import { usePanelFlotante } from "@/components/ui";

/** Los íconos ofrecidos, agrupados por para qué sirven. El orden es el de la grilla. */
const ICONOS = [
  "📄", "📝", "📚", "🗂️", "🧭", "🗺️", "📌", "🔖",
  "📈", "📊", "🎯", "🏁", "✅", "⚠️", "⛔", "💡",
  "💼", "📣", "🎧", "🤝", "👥", "🧑‍💻", "🛠️", "⚙️",
  "🔍", "🧩", "🧱", "🔐", "🔔", "⏱️", "📅", "💬",
  "💰", "🧾", "🚀", "🌱", "⭐", "🧠", "🪄", "❓",
] as const;

interface Props {
  icono: string | null;
  /** Falso = solo se muestra, sin abrir nada. */
  editable: boolean;
  onElegir: (icono: string | null) => void;
}

export default function SelectorDeIcono({ icono, editable, onElegir }: Props) {
  const { abierto, setAbierto, alternar, pos, rootRef, btnRef, panelRef } = usePanelFlotante({
    side: "bottom",
    align: "start",
    selectorDeItems: '[role="menuitem"]',
  });

  if (!editable) {
    return (
      <span className="px-1 text-5xl leading-none" aria-hidden="true">
        {icono ?? "📄"}
      </span>
    );
  }

  const elegir = (valor: string | null) => {
    setAbierto(false);
    onElegir(valor);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={alternar}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Cambiar el ícono de la página"
        title="Cambiar el ícono"
        className="rounded-lg px-1 text-5xl leading-none transition-colors hover:bg-surface-hover"
      >
        {icono ?? "📄"}
      </button>

      {abierto && pos && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Íconos"
          className="fixed z-50 w-72 rounded-xl border border-line bg-surface p-2 shadow-xl"
          style={{ ...pos, maxHeight: "calc(100vh - 16px)", overflowY: "auto" }}
        >
          <div className="grid grid-cols-8 gap-1">
            {ICONOS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                onClick={() => elegir(emoji)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-surface-hover",
                  emoji === icono && "bg-surface-active ring-1 ring-line",
                )}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => elegir(null)}
            className="mt-2 w-full rounded-md border-t border-line px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            Sin ícono
          </button>
        </div>
      )}
    </div>
  );
}
