"use client";

/**
 * Los dos botones de la ficha de un caso: copiar su enlace (para pegarlo en una preventa o un chat) y sugerir un
 * cambio, que abre el panel de Feedback con el caso arriba.
 */
import { useState } from "react";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { BOTON_DE_HERRAMIENTA } from "@/components/ui/sistema";

export function AccionesDelCaso({ casoId, titulo }: { casoId: string; titulo: string }) {
  const abrirFeedback = useFeedback()?.abrir;
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/sales/use-cases/${casoId}`);
      setCopiado("si");
    } catch {
      setCopiado("no");
    }
    window.setTimeout(() => setCopiado(null), 1800);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void copiar()} className={BOTON_DE_HERRAMIENTA}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </svg>
        {copiado === "si" ? "Enlace copiado" : copiado === "no" ? "No se pudo copiar" : "Copiar enlace"}
      </button>
      {abrirFeedback && (
        <button type="button" onClick={() => abrirFeedback({ catalogo: { modo: "cambio", casoId, titulo } })} className={BOTON_DE_HERRAMIENTA}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
          Sugerir un cambio
        </button>
      )}
    </div>
  );
}
