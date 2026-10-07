"use client";

/**
 * components/feedback/BotonDeFeedback.tsx — «Feedback», fijo en el pie del menú de todas las pantallas
 * internas. Abre (o cierra) el panel de la derecha. Las respuestas no llevan un número propio acá:
 * llegan como aviso a «Para ti», que ya los cuenta.
 */
import { cn } from "@/lib/cn";
import { useFeedback } from "./FeedbackProvider";
import { ICONO_FEEDBACK, Trazo } from "./piezas";

export default function BotonDeFeedback({ isOpen }: { isOpen: boolean }) {
  const feedback = useFeedback();
  if (!feedback) return null;
  const abierto = feedback.abierto;
  return (
    <button
      type="button"
      data-recorrido="feedback.boton"
      onClick={feedback.alternar}
      aria-pressed={abierto}
      title={isOpen ? "Dar feedback sobre esta pantalla" : "Feedback"}
      className={cn(
        "flex w-full items-center rounded-lg text-sm transition-colors",
        isOpen ? "gap-2.5 px-3 py-2" : "justify-center p-2.5",
        abierto ? "bg-surface-hover font-medium text-fg" : "text-fg-secondary hover:bg-surface-muted hover:text-fg",
      )}
    >
      <Trazo d={ICONO_FEEDBACK} className="h-4 w-4 flex-shrink-0" />
      {isOpen && <span className="truncate">Feedback</span>}
    </button>
  );
}
