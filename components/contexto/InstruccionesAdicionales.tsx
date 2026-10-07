"use client";

/**
 * components/contexto/InstruccionesAdicionales.tsx — la caja «Instrucciones adicionales» del
 * «Contexto adicional» (2026-10-06).
 *
 * Lo que la persona le pide a la IA de esa pieza («enfócate en el área de Servicio», «no propongas
 * migraciones»). Es la misma caja que vive en el cronograma, con tokens del tema: plegable, con el
 * estado (activas / sin guardar), un contador contra el tope y «Guardar instrucciones». Quién la
 * guarda y dónde lo decide la pieza (`onGuardar`).
 */
import { useState } from "react";

export default function InstruccionesAdicionales({
  guardadas,
  onGuardar,
  tope,
  explicacion,
  ejemplo,
  soloLectura,
}: {
  /** Lo guardado hoy ("" = nada). */
  guardadas: string;
  /** Guarda el texto; devuelve si se guardó. */
  onGuardar: (texto: string) => Promise<boolean>;
  tope: number;
  explicacion: string;
  ejemplo: string;
  soloLectura?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState(guardadas);
  const [guardando, setGuardando] = useState(false);
  // Lo que viene de afuera (otra pestaña, el agente) reemplaza lo escrito solo si no hay cambios propios.
  const [base, setBase] = useState(guardadas);
  if (guardadas !== base) {
    setBase(guardadas);
    if (texto.trim() === base.trim()) setTexto(guardadas);
  }
  const sinGuardar = texto.trim() !== guardadas.trim();

  async function guardar() {
    setGuardando(true);
    try {
      await onGuardar(texto.trim());
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-2.5">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex items-center gap-1.5 text-xs font-semibold text-fg transition-colors hover:text-brand"
      >
        <svg
          className={`h-3 w-3 transition-transform ${abierta ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        Instrucciones adicionales
        {sinGuardar ? (
          <span className="rounded-full border border-warn-line bg-warn-surface px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warn-ink">
            sin guardar
          </span>
        ) : guardadas.trim() ? (
          <span className="rounded-full border border-success-line bg-success-surface px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success-ink">
            activas
          </span>
        ) : null}
      </button>
      {abierta && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] leading-relaxed text-fg-muted">
            {explicacion}
          </p>
          {soloLectura ? (
            <p className="whitespace-pre-wrap text-xs text-fg-secondary">
              {guardadas.trim() || "Sin instrucciones."}
            </p>
          ) : (
            <>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={3}
                maxLength={tope}
                placeholder={ejemplo}
                aria-label="Instrucciones adicionales"
                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-brand focus:outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`text-[10px] ${texto.length >= tope ? "text-warn-ink" : "text-fg-muted"}`}
                  aria-live="polite"
                >
                  {texto.length.toLocaleString("es-CR")} /{" "}
                  {tope.toLocaleString("es-CR")}
                  {texto.length >= tope &&
                    " · Llegaste al tope: lo que pegues de más no entra."}
                </p>
                <button
                  type="button"
                  onClick={() => void guardar()}
                  disabled={guardando || !sinGuardar}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {guardando ? "Guardando…" : "Guardar instrucciones"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
