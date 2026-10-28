"use client";

/**
 * components/external/test/DescargarPdfDelResultado.tsx — «Descargar PDF» en la página de resultado del test. Lo arma el
 * servidor con el motor de PDF de siempre (lib/print/pdf-runner.ts) y tarda unos segundos: mientras, el botón dice que lo
 * está preparando; si falla, lo dice debajo.
 */
import { useState } from "react";

/** El nombre que dio el servidor (`Content-Disposition`), o uno genérico. */
const nombreDelArchivo = (cd: string | null) => cd?.match(/filename="([^"]+)"/)?.[1] ?? "diagnostico.pdf";

export default function DescargarPdfDelResultado({ href }: { href: string }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descargar = async () => {
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(href);
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "No se pudo preparar el PDF. Vuelve a intentarlo.");
        return;
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreDelArchivo(r.headers.get("content-disposition"));
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("No hay conexión. Revisa tu internet y vuelve a intentarlo.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => void descargar()} aria-busy={ocupado || undefined}>
        {ocupado ? "Preparando el PDF…" : "Descargar PDF"}
      </button>
      {error && (
        <p className="rd-pdf-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
