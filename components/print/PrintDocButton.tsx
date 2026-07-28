"use client";

/**
 * components/print/PrintDocButton.tsx — el botón "Exportar PDF" de la cabecera del canvas.
 *
 * Un botón, dos caminos, y la decisión NO es un `if` que haya que mantener:
 *
 *   · la pieza está en el registro de impresión → POST al endpoint genérico, que devuelve el
 *     PDF con el diseño del motor (lo mismo que se ve en pantalla);
 *   · no está → link a `/print/canvas/**`, la vista imprimible de siempre.
 *
 * El segundo caso NO es un fallback provisorio: cubre el handoff, el cronograma, el
 * «Resumen» y los canvas a medida del CSE, que no tienen definición en el motor y son de
 * cantidad no acotada. Un canvas nuevo cae ahí solo, sin tocar este archivo.
 */
import { useState } from "react";
import { ApiError, extractErrorMessage } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { printDocForPiece } from "@/lib/print/doc-types";

const ICONO_IMPRESORA = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
  />
);

const CLASES =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 bg-surface-muted border-line text-fg-secondary hover:bg-surface-hover";

export default function PrintDocButton({
  projectId,
  activeSlug,
  canvasHref,
}: {
  projectId: string;
  /** Slug de la pieza del canvas activo; null en el «Resumen» y en los canvas a medida. */
  activeSlug: string | null;
  /** El link de la vista imprimible genérica, para cuando la pieza no tiene documento. */
  canvasHref: string;
}) {
  const toast = useToast();
  const [working, setWorking] = useState(false);
  const tipo = printDocForPiece(activeSlug);

  if (!tipo) {
    return (
      <a
        href={canvasHref}
        target="_blank"
        rel="noopener noreferrer"
        className={CLASES}
        title="Abre una vista imprimible para guardar como PDF"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {ICONO_IMPRESORA}
        </svg>
        Exportar PDF
      </a>
    );
  }

  const download = async () => {
    if (working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/print/${tipo.id}/${projectId}/export`, { method: "POST" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new ApiError(extractErrorMessage(payload), res.status, payload);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? `${tipo.id}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      // El documento no entró en una sola hoja y salió paginado: se avisa en vez de callarlo,
      // porque el PDF se ve distinto al de siempre y quien lo abre merece saber por qué.
      if (res.headers.get("X-Pdf-Paged") === "1") {
        toast.success("PDF descargado — es largo, así que salió en varias páginas.");
      } else {
        toast.success("PDF descargado.");
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo generar el PDF.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={download}
        disabled={working}
        className={CLASES}
        title={`Descarga el ${tipo.label.toLowerCase()} con el diseño del documento (contenido actual)`}
      >
        <svg
          className={`w-3.5 h-3.5 ${working ? "animate-spin" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {working ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          ) : (
            ICONO_IMPRESORA
          )}
        </svg>
        {working ? "Generando…" : "Exportar PDF"}
      </button>
      {/* Ver la hoja ANTES de exportarla: es la misma página que captura Puppeteer, así que
          revisar acá es revisar el PDF. Vale un ícono discreto, no un segundo botón. */}
      <a
        href={`/print/doc/${tipo.id}/${projectId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1.5 rounded-lg text-fg-muted hover:text-fg-secondary hover:bg-surface-hover transition-colors"
        title="Ver la hoja tal como va a salir impresa"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
      </a>
    </div>
  );
}
