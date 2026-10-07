"use client";

/**
 * «Generar prompt»: el prompt para Claude Code de un reporte o de un tema, listo para copiar.
 *
 * Lo arma una plantilla (lib/feedback/prompt.ts), no un agente: por eso va sin la chispa de la IA. Se
 * puede retocar antes de copiar; lo retocado no se guarda en ningún lado.
 */
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

export default function DialogoPrompt({
  sobre,
  prompt,
  error,
  onCerrar,
}: {
  /** «F-12» o el nombre del tema. */
  sobre: string;
  /** null mientras se arma. */
  prompt: string | null;
  error: string | null;
  onCerrar: () => void;
}) {
  return (
    <Modal
      open
      onClose={onCerrar}
      title="Prompt para Claude Code"
      description={`${sobre}. Pégalo en Claude Code con el proyecto de Nexus abierto: ya sabe dónde está cada cosa.`}
      size="xl"
    >
      {error ? (
        <p className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2.5 text-[13px] text-danger-ink">{error}</p>
      ) : prompt === null ? (
        <div className="skeleton-shimmer h-[320px] rounded-lg border border-line" aria-label="Armando el prompt" />
      ) : (
        <TextoDelPrompt key={prompt} inicial={prompt} onCerrar={onCerrar} />
      )}
    </Modal>
  );
}

function TextoDelPrompt({ inicial, onCerrar }: { inicial: string; onCerrar: () => void }) {
  const toast = useToast();
  const [texto, setTexto] = useState(inicial);
  const [copiado, setCopiado] = useState(false);
  const [noSePudo, setNoSePudo] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setNoSePudo(false);
      toast.success("Copiado. Pégalo en Claude Code.");
    } catch {
      // El texto queda a la vista: se selecciona y se copia a mano.
      setNoSePudo(true);
    }
  };

  return (
    <div className="space-y-3">
      <textarea
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setCopiado(false);
        }}
        rows={16}
        aria-label="El prompt"
        spellCheck={false}
        className="w-full resize-y rounded-lg border border-line bg-surface-muted px-3 py-2.5 text-[13px] leading-[1.5] text-fg focus:border-brand focus:outline-none"
      />
      {noSePudo && <p className="text-xs text-warn-ink">No se pudo copiar solo: selecciona el texto y cópialo a mano.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">Puedes retocarlo antes de copiarlo. No lleva nombres ni correos de nadie.</p>
        <span className="flex items-center gap-2">
          <button type="button" onClick={onCerrar} className="rounded px-2.5 py-2 text-[13px] text-fg-muted hover:text-fg">
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => void copiar()}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            {copiado ? "Copiado ✓" : "Copiar el prompt"}
          </button>
        </span>
      </div>
    </div>
  );
}
