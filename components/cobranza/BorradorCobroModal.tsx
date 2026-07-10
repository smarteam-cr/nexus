"use client";

/**
 * components/cobranza/BorradorCobroModal.tsx
 *
 * Borrador de correo de cobro (feature 1): al abrir genera el borrador con IA
 * (POST /api/cobranza/cobros/[id]/borrador — sync), la persona lo EDITA y lo
 * copia o lo abre en su correo. SIN envío automático (CommunicationPort v1).
 * La generación ya queda registrada en la bitácora de la cuenta.
 */
import { useEffect, useRef, useState } from "react";
import { Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { CobroDTO } from "@/lib/cobranza";
import { fmtFecha, fmtMonto, INPUT_CLS, LABEL_CLS } from "./format";

interface BorradorResponse {
  borrador: { asunto: string; cuerpo: string };
  mailtoUrl: string | null;
  correoCobro: string | null;
}

export default function BorradorCobroModal({
  cobro,
  onClose,
}: {
  cobro: CobroDTO;
  onClose: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [correoCobro, setCorreoCobro] = useState<string | null>(null);
  const generadoPara = useRef<string | null>(null);

  useEffect(() => {
    if (generadoPara.current === cobro.id) return; // StrictMode/re-render: una sola generación
    generadoPara.current = cobro.id;
    (async () => {
      try {
        const d = await fetchJson<BorradorResponse>(`/api/cobranza/cobros/${cobro.id}/borrador`, {
          method: "POST",
        });
        setAsunto(d.borrador.asunto);
        setCuerpo(d.borrador.cuerpo);
        setCorreoCobro(d.correoCobro);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "No se pudo generar el borrador.");
      } finally {
        setLoading(false);
      }
    })();
  }, [cobro.id]);

  // El mailto se arma con el TEXTO EDITADO (no el original del agente).
  const mailtoUrl = correoCobro
    ? `mailto:${encodeURIComponent(correoCobro)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo.slice(0, 1800))}`
    : null;
  const cuerpoLargo = cuerpo.length > 1800;

  async function copiar(texto: string, label: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error("No se pudo copiar — seleccioná y copiá a mano.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      z="z-[70]"
      title="Borrador de correo de cobro"
      description={`${fmtMonto(cobro.monto, cobro.moneda)} · programado ${fmtFecha(cobro.fechaProgramada)} — revisalo, ajustalo y envialo desde tu correo.`}
      footer={
        !loading && !error ? (
          <>
            <button
              type="button"
              onClick={() => copiar(asunto, "Asunto")}
              className="text-xs text-fg-muted hover:text-fg px-2 py-1.5"
            >
              Copiar asunto
            </button>
            <button
              type="button"
              onClick={() => copiar(cuerpo, "Cuerpo")}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover transition-colors"
            >
              Copiar cuerpo
            </button>
            {mailtoUrl ? (
              <a
                href={mailtoUrl}
                title={cuerpoLargo ? "El cuerpo es largo y el correo lo puede truncar — mejor copialo." : undefined}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors"
              >
                Abrir en correo
              </a>
            ) : (
              <span
                title="La cuenta no tiene correo de cobro registrado — agregalo en el drawer de la cuenta."
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-fg-muted opacity-60 cursor-not-allowed"
              >
                Abrir en correo
              </span>
            )}
          </>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Spinner />
          <p className="text-xs text-fg-muted">Redactando el borrador con el contexto de la cuenta…</p>
        </div>
      ) : error ? (
        <p className="text-xs text-red-600 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-3">
          {error}
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className={LABEL_CLS}>Asunto</label>
            <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className={LABEL_CLS}>Cuerpo</label>
            <textarea
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand resize-y"
            />
            {cuerpoLargo && (
              <p className="mt-1 text-[10px] text-amber-600">
                El cuerpo supera lo que un mailto aguanta — usá &quot;Copiar cuerpo&quot; y pegalo en tu correo.
              </p>
            )}
          </div>
          <p className="text-[10px] text-fg-muted">
            El borrador usa solo el contexto real de la cuenta (bitácora). Reemplazá [FIRMA] con tu firma.
            {correoCobro ? ` Destino: ${correoCobro}.` : " La cuenta no tiene correo de cobro registrado."}
          </p>
        </div>
      )}
    </Modal>
  );
}
