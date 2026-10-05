"use client";

import TarjetaDeConexion from "./TarjetaDeConexion";

import { useState } from "react";
import { useMe } from "@/hooks/useMe";

interface HubspotStatus {
  connected: boolean;
  hubName?: string | null;
  hubspotPortalId?: string | null;
  updatedAt?: string;
}

interface ImportResult {
  total: number;
  created: number;
}

export default function HubspotSystemCard({
  status,
  justConnected,
}: {
  status: HubspotStatus;
  justConnected: boolean;
}) {
  /* Gate COSMÉTICO, y hace falta: la página entra con `configuracion.read` pero el endpoint
     exige `configuracion.manage`, así que CSL y MARKETING veían el botón y comían un 403. Con el
     nombre viejo la jerga («Nexus = true») funcionaba de barrera accidental —"esto no es para
     mí"—; con un nombre amable, un control muerto se vuelve una trampa. La regla del repo para
     puntos de entrada es ocultar, no deshabilitar con excusa. */
  const me = useMe();
  const puedeImportar = me?.permissions.sections.configuracion?.manage === true;

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const res = await fetch("/api/system/hubspot/import", { method: "POST" });
      const data = await res.json() as { ok?: boolean; total?: number; created?: number; updated?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error al importar");
      setImportResult({ total: data.total ?? 0, created: data.created ?? 0 });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setImporting(false);
    }
  };

  return (
    <TarjetaDeConexion
      nombre="HubSpot"
      queTrae="Las empresas, los tratos y los proyectos"
      estado={
        status.connected
          ? { tono: "ok", texto: "Responde" }
          : { tono: "apagado", texto: "Sin conectar" }
      }
      dato={
        status.connected && status.hubName ? { numero: status.hubName, unidad: "es el portal" } : null
      }
      pie={
        status.connected
          ? `Portal #${status.hubspotPortalId}`
          : "Conectarla la habilita quien administra la configuración"
      }
      accion={
        status.connected && puedeImportar ? (
          /* A-01 cerró el OAuth: `?system=1` exige `configuracion.manage` —la MISMA celda que
             `puedeImportar`—. Sin el gate, quien no la tiene navega a un 403 que el browser
             pinta como JSON crudo, porque es un <a> de navegación, no un fetch. */
          <a
            href="/api/auth/hubspot?system=1"
            className="text-[13px] font-semibold text-brand hover:text-brand-light"
          >
            Cambiar cuenta
          </a>
        ) : !status.connected && puedeImportar ? (
          <a
            href="/api/auth/hubspot?system=1"
            className="text-[13px] font-semibold text-brand hover:text-brand-light"
          >
            Conectar
          </a>
        ) : undefined
      }
    >
      {justConnected && (
        <p className="text-xs leading-[17px] text-success-ink bg-success-surface border border-success-line rounded-lg px-3 py-2">
          HubSpot quedó conectado.
        </p>
      )}

      {importResult && (
        <p className="text-xs leading-[17px] text-fg-secondary bg-info-surface border border-info-line rounded-lg px-3 py-2">
          {/* Se dejó de contar «actualizadas»: esa cifra contaba filas donde no cambió nada, así
              que la pantalla celebraba trabajo que no ocurrió. Lo que importa es cuántas son
              NUEVAS. */}
          {importResult.total === 0
            ? "Ninguna empresa tiene marcada la casilla «Nexus» en HubSpot. Si acabás de marcar una, esperá un momento y volvé a buscar."
            : importResult.total === 1
              ? `1 empresa marcada en HubSpot: ${importResult.created === 1 ? "es nueva en Nexus" : "ya estaba en Nexus"}.`
              : `${importResult.total} empresas marcadas en HubSpot: ${importResult.created} nuevas en Nexus, ${importResult.total - importResult.created} ya estaban.`}
        </p>
      )}

      {importError && (
        <p className="text-xs leading-[17px] text-danger-ink bg-danger-surface border border-danger-line rounded-lg px-3 py-2">
          {importError}
        </p>
      )}

      {status.connected && puedeImportar && (
        <button
          onClick={handleImport}
          disabled={importing}
          className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface text-fg-secondary text-[13px] font-semibold hover:bg-surface-hover disabled:opacity-50 transition-colors"
        >
          {importing ? (
            <>
              <span className="w-3 h-3 border border-line border-t-brand rounded-full animate-spin" />
              Buscando…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Buscar empresas nuevas en HubSpot
            </>
          )}
        </button>
      )}
    </TarjetaDeConexion>
  );
}
