"use client";

/**
 * components/cobranza/ReporteFinanzasModal.tsx
 *
 * Reporte de finanzas con IA (fase 3, 2 voces): al abrir genera el reporte
 * (POST /api/cobranza/reporte — sync) y lo muestra para leer/copiar. La voz
 * llega por prop; el gate de la voz ejecutiva (solo Super Admin) es SERVER-SIDE
 * — acá solo se muestra el error del server si aplica.
 */
import { useEffect, useRef, useState } from "react";
import { Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";

interface ReporteResponse {
  titulo: string;
  cuerpo: string;
  runId: string;
}

const VOZ_DESC: Record<"operativa" | "ejecutiva", string> = {
  operativa: "Voz operativa — accionable, para quien gestiona el cobro día a día.",
  ejecutiva: "Voz ejecutiva — agregados y tendencia, para dirección.",
};

export default function ReporteFinanzasModal({
  voz,
  onClose,
}: {
  voz: "operativa" | "ejecutiva";
  onClose: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const generadoPara = useRef<string | null>(null);

  useEffect(() => {
    if (generadoPara.current === voz) return; // StrictMode/re-render: una sola generación
    generadoPara.current = voz;
    (async () => {
      try {
        const d = await fetchJson<ReporteResponse>("/api/cobranza/reporte", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voz }),
        });
        setTitulo(d.titulo);
        setCuerpo(d.cuerpo);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "No se pudo generar el reporte.");
      } finally {
        setLoading(false);
      }
    })();
  }, [voz]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`${titulo}\n\n${cuerpo}`);
      toast.success("Reporte copiado.");
    } catch {
      toast.error("No se pudo copiar — seleccioná y copiá a mano.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={!loading && !error && titulo ? titulo : "Reporte de finanzas"}
      description={VOZ_DESC[voz]}
      footer={
        <>
          {!loading && !error && (
            <button
              type="button"
              onClick={copiar}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors"
            >
              Copiar
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover transition-colors"
          >
            Cerrar
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Spinner />
          <p className="text-xs text-fg-muted">Analizando la cartera y armando el reporte…</p>
        </div>
      ) : error ? (
        <p className="text-xs text-red-600 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-3">
          {error}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-fg whitespace-pre-wrap rounded-lg border border-line bg-surface px-4 py-3">
            {cuerpo}
          </div>
          <p className="text-[10px] text-fg-muted">
            El reporte usa solo los datos reales de la cartera (métricas en vivo + cortes registrados).
            Revisalo antes de compartirlo.
          </p>
        </div>
      )}
    </Modal>
  );
}
