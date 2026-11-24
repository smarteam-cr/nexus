"use client";

/**
 * components/exploraciones/BotonDeNexus.tsx — el botón «Nexus» arriba a la derecha de la preventa: la ÚNICA puerta (etapa 2
 * del plan maestro de «Hablar con Nexus», 23 nov). Abre el cajón de «Hablar con Nexus» (HablarConNexus.tsx), que ya no tiene
 * botón en el riel. Se ve igual que el de la ficha del cliente (components/nexus-chat/ChatDeNexus.tsx).
 */
import { abrirNexusEnLaPreventa } from "@/lib/exploraciones/abrir-nexus";

export default function BotonDeNexus({ exploracionId }: { exploracionId: string }) {
  return (
    <button
      type="button"
      onClick={() => abrirNexusEnLaPreventa({ exploracionId })}
      title="Cuéntale a Nexus lo que sabes del cliente, pregúntale lo que se habló o pídele una tarea"
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:bg-surface-hover"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
      </svg>
      Nexus
    </button>
  );
}
