"use client";

/**
 * components/ai/AssistDialog.tsx — diálogo COMPARTIDO del assist de documento
 * ("✨ Mejorar con IA"): instrucción libre + chips de ejemplo → onSubmit. El
 * padre corre el assist (POST .../assist) y muestra la propuesta en
 * <AgentProposal> (revisar → aplicar/descartar). Sucesor de TimelineAssistDialog
 * sin el selector de alcance (el assist es de documento entero), sobre la
 * primitiva Modal (§1-UI) y con tokens.
 *
 * La IA puede investigar en línea a su criterio (web_search) — por eso el label
 * de carga avisa que puede tardar.
 */
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

export default function AssistDialog({
  open,
  onClose,
  title,
  subtitle = "Describe la mejora; la IA propone y tú revisas antes de aplicar. Puede investigar en línea si hace falta.",
  chips,
  placeholder,
  loading,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Ejemplos clickeables que llenan la instrucción. */
  chips: string[];
  placeholder?: string;
  loading: boolean;
  onSubmit: (instruction: string) => void;
}) {
  const [instruction, setInstruction] = useState("");

  // Limpia la instrucción al reabrir (cada assist arranca de cero) — patrón
  // "ajustar estado durante el render" (react.dev), no un effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setInstruction("");
  }

  const canSubmit = instruction.trim().length >= 4 && !loading;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={subtitle}
      size="lg"
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-sm font-medium px-3.5 py-2 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSubmit(instruction.trim())}
            disabled={!canSubmit}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg bg-primary text-primary-fg hover:bg-primary-hover transition-colors disabled:opacity-40"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-primary-fg/40 border-t-primary-fg rounded-full animate-spin" />
                Generando… (puede investigar en línea)
              </>
            ) : (
              "Generar propuesta"
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider">
          Qué quieres mejorar
        </label>
        <textarea
          autoFocus
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={loading}
          placeholder={placeholder ?? 'Ej: "haz las medidas más accionables"'}
          className="w-full text-sm bg-surface-muted border border-line rounded-lg px-3 py-2 text-fg placeholder-fg-muted focus:outline-none focus:border-brand resize-none disabled:opacity-60"
        />
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              disabled={loading}
              onClick={() => setInstruction(c)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-surface-muted border border-line text-fg-secondary hover:border-brand hover:text-brand transition-colors disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
